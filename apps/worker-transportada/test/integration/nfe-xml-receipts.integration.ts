/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301 contra Postgres de verdade: a fila de recibos (reserva em lote sem dobrar, retomada de abandonados, retentativa),
 * a autorização do remetente por e-mail, a importação criada na mesma transação (com os CHECKs reais) e a seleção dos
 * resumos — que só saem depois que a importação termina.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createDrizzleNfeXmlReceiptRepository } from '../../src/nfe-xml-receipts/infrastructure/drizzle-nfe-xml-receipt.repository.js'
import { createDrizzleReceivedXmlImportGateway } from '../../src/nfe-xml-receipts/infrastructure/drizzle-received-xml-import.gateway.js'
import { createReceiptOperatorAlertAdapter } from '../../src/nfe-xml-receipts/infrastructure/receipt-operator-alert.adapter.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const NOW = new Date('2026-11-08T12:00:00.000Z')
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000)

describeDatabase('nfe xml receipts (integration, spec 301)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const database = provider.db
  const repository = createDrizzleNfeXmlReceiptRepository({ database })
  const companyId = crypto.randomUUID()
  const operatorId = crypto.randomUUID()
  const viewerId = crypto.randomUUID()
  const adminId = crypto.randomUUID()
  const puts: string[] = []
  const storage = {
    bucket: 'integration',
    put: (input: { key: string }) => {
      puts.push(input.key)
      return Promise.resolve({ provider: 's3' as const })
    },
  }
  const importGateway = createDrizzleReceivedXmlImportGateway({ database, storage })

  async function seedUser(userId: string, email: string, role: string) {
    const membershipId = crypto.randomUUID()
    await database.execute(
      sql`insert into identity_users (id, status) values (${userId}, 'active')`,
    )
    await database.execute(sql`
      insert into identity_user_profiles (user_id, name, contact_channel, contact_address, username, email)
      values (${userId}, ${`Pessoa ${role}`}, 'email', ${email}, ${`u-${userId}`}, ${email})
    `)
    await database.execute(sql`
      insert into user_company_memberships (id, user_id, company_id, status)
      values (${membershipId}, ${userId}, ${companyId}, 'active')
    `)
    await database.execute(sql`
      insert into membership_roles (membership_id, role) values (${membershipId}, ${role})
    `)
  }

  async function record(messageId: string, overrides: Record<string, unknown> = {}) {
    return repository.recordReceipt({
      channel: 'whatsapp',
      companyId,
      now: NOW,
      providerMessageId: messageId,
      replyTo: '120363@g.us',
      requestedByUserId: operatorId,
      sender: '5516988887777',
      status: 'pending',
      ...overrides,
    } as never)
  }

  beforeAll(async () => {
    await database.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await seedUser(operatorId, 'operador@transportadora.com.br', 'operator')
    await seedUser(adminId, 'admin@transportadora.com.br', 'company-admin')
    await seedUser(viewerId, 'leitor@transportadora.com.br', 'viewer')
    // O ator sintético da caixa de e-mail precisa de vínculo ativo na empresa (FK de nfe_imports).
    await database.execute(sql`
      insert into identity_users (id, status) values ('00000000-0000-4000-8000-000000000006', 'active')
      on conflict do nothing
    `)
    await database.execute(sql`
      insert into user_company_memberships (id, user_id, company_id, status)
      values (${crypto.randomUUID()}, '00000000-0000-4000-8000-000000000006', ${companyId}, 'active')
    `)
  })

  afterAll(async () => {
    await provider.close()
  })

  test('recording is idempotent per (company, channel, message): a repeated delivery is not created twice', async () => {
    const first = await record('m-idem')
    const again = await record('m-idem')
    expect(first.created).toBe(true)
    expect(again).toEqual({ created: false, receiptId: first.receiptId })
  })

  test('claims a bounded batch once: concurrent workers never take the same receipt', async () => {
    for (let index = 0; index < 5; index += 1) await record(`m-claim-${index}`)
    const [first, second] = await Promise.all([
      repository.claimPending({ limit: 3, now: later(1) }),
      repository.claimPending({ limit: 3, now: later(1) }),
    ])
    const ids = [...first, ...second].map((receipt) => receipt.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(first.every((receipt) => receipt.attempts === 1)).toBe(true)
    expect(first[0]).toMatchObject({ channel: 'whatsapp', companyId, replyTo: '120363@g.us' })
  })

  test('a receipt abandoned in processing by a dead worker goes back to the queue, and a retry waits its time', async () => {
    const { receiptId } = await record('m-stale')
    await repository.claimPending({ limit: 50, now: later(10) })
    expect(await repository.releaseStale({ now: later(10 + 60), staleSeconds: 900 })).toBe(0)
    expect(
      await repository.releaseStale({ now: later(10 + 1000), staleSeconds: 900 }),
    ).toBeGreaterThan(0)

    await repository.scheduleRetry({ errorCode: 'Boom', nextAttemptAt: later(5000), receiptId })
    const early = await repository.claimPending({ limit: 50, now: later(2000) })
    expect(early.map((receipt) => receipt.id)).not.toContain(receiptId)
    const due = await repository.claimPending({ limit: 50, now: later(6000) })
    expect(due.map((receipt) => receipt.id)).toContain(receiptId)
  })

  test('only an e-mail of a company member with an importing role is an authorized sender', async () => {
    const find = (email: string) => repository.findAuthorizedSenderByEmail({ companyId, email })
    expect(await find('OPERADOR@transportadora.com.br')).toEqual({ userId: operatorId })
    expect(await find('admin@transportadora.com.br')).toEqual({ userId: adminId })
    expect(await find('leitor@transportadora.com.br')).toBeUndefined()
    expect(await find('desconhecido@x.com')).toBeUndefined()
    expect(
      await repository.findAuthorizedSenderByEmail({
        companyId: crypto.randomUUID(),
        email: 'operador@transportadora.com.br',
      }),
    ).toBeUndefined()
  })

  test('a contractor contact with the nfe_xml type and an active status is an authorized sender too (spec 302)', async () => {
    const [contractor] = (await database.execute(sql`
      insert into contractors (company_id, tax_id, display_name)
      values (${companyId}, '98765432000110', 'Contratante') returning id
    `)) as unknown as { id: string }[]
    const contractorId = contractor?.id ?? ''
    const seed = (email: string, types: string, status = 'active') =>
      database.execute(sql`
        insert into contractor_contacts (company_id, contractor_id, email, types, status)
        values (${companyId}, ${contractorId}, ${email}, ${types}::text[], ${status})
      `)
    await seed('envia@contratante.com.br', '{nfe_xml}')
    await seed('so-ocorrencia@contratante.com.br', '{occurrences}')
    await seed('inativo@contratante.com.br', '{nfe_xml}', 'inactive')
    const find = (email: string, company = companyId) =>
      repository.findAuthorizedSenderByEmail({ companyId: company, email })
    expect(await find('ENVIA@contratante.com.br')).toEqual({
      userId: '00000000-0000-4000-8000-000000000006',
    })
    expect(await find('so-ocorrencia@contratante.com.br')).toBeUndefined()
    expect(await find('inativo@contratante.com.br')).toBeUndefined()
    expect(await find('envia@contratante.com.br', crypto.randomUUID())).toBeUndefined()
  })

  test('the import is created whole: stored objects, import, items (first is "/"), outbox event and the receipt closed', async () => {
    const { receiptId } = await record('m-import')
    const { importId } = await importGateway.createImport({
      automationJob: null,
      companyId,
      correlationId: 'corr-int',
      files: [
        { bytes: new TextEncoder().encode('<a/>'), name: 'a.xml' },
        { bytes: new TextEncoder().encode('<b/>'), name: 'b.xml' },
      ],
      receiptId,
      receivedFrom: '5516988887777',
      receivedVia: 'whatsapp',
      requestedByUserId: operatorId,
    })
    const [imported] = (await database.execute(sql`
      select source, status, received_via, received_from, received_count::int as received, triggered_by
      from nfe_imports where id = ${importId}::uuid
    `)) as unknown as Record<string, unknown>[]
    expect(imported).toMatchObject({
      received: 2,
      received_from: '5516988887777',
      received_via: 'whatsapp',
      source: 'upload',
      status: 'queued',
      triggered_by: 'user',
    })
    const items = (await database.execute(sql`
      select ordinal::int as ordinal, source_entry, status from nfe_import_items
      where import_id = ${importId}::uuid order by ordinal
    `)) as unknown as { ordinal: number; source_entry: string; status: string }[]
    expect(items).toEqual([
      { ordinal: 1, source_entry: '/', status: 'pending' },
      { ordinal: 2, source_entry: 'b.xml', status: 'pending' },
    ])
    const [outbox] = (await database.execute(sql`
      select event_type, payload from processing_outbox where aggregate_id = ${importId}::uuid
    `)) as unknown as { event_type: string; payload: { importId: string } }[]
    expect(outbox).toEqual({
      event_type: 'transportada.nfe.import.requested',
      payload: { importId },
    })
    const [receipt] = (await database.execute(sql`
      select status, import_id, files_count from nfe_xml_receipts where id = ${receiptId}::uuid
    `)) as unknown as { files_count: number; import_id: string; status: string }[]
    expect(receipt).toEqual({ files_count: 2, import_id: importId, status: 'imported' })
  })

  test('the mailbox import is an automation one and survives a repeated delivery without a second import', async () => {
    const { receiptId } = await record('m-mail', {
      channel: 'email',
      replyTo: undefined,
      sender: 'admin@transportadora.com.br',
    })
    const input = {
      automationJob: 'nfe.xml.mailbox',
      companyId,
      correlationId: 'corr-mail',
      files: [{ bytes: new TextEncoder().encode('<a/>'), name: 'a.xml' }],
      receiptId,
      receivedFrom: 'admin@transportadora.com.br',
      receivedVia: 'email',
      requestedByUserId: '00000000-0000-4000-8000-000000000006',
    } as const
    const first = await importGateway.createImport(input)
    const again = await importGateway.createImport(input)
    expect(again).toEqual(first)
    const [count] = (await database.execute(sql`
      select count(*)::int as n from nfe_imports where company_id = ${companyId}::uuid and idempotency_key = ${`xml-email-${receiptId}`}
    `)) as unknown as { n: number }[]
    expect(count?.n).toBe(1)
    const [row] = (await database.execute(sql`
      select triggered_by, automation_job from nfe_imports where id = ${first.importId}::uuid
    `)) as unknown as { automation_job: string; triggered_by: string }[]
    expect(row).toEqual({ automation_job: 'nfe.xml.mailbox', triggered_by: 'automation' })
  })

  test('a summary is only due after the import finishes; a rejection is due at once; each is sent once', async () => {
    const { receiptId: waiting } = await record('m-sum-wait')
    await importGateway.createImport({
      automationJob: null,
      companyId,
      correlationId: 'c',
      files: [{ bytes: new TextEncoder().encode('<a/>'), name: 'a.xml' }],
      receiptId: waiting,
      receivedFrom: '5516988887777',
      receivedVia: 'whatsapp',
      requestedByUserId: operatorId,
    })
    const { receiptId: refused } = await record('m-sum-refused')
    await repository.markRejected({
      now: later(1),
      reason: 'sender_not_allowed',
      receiptId: refused,
    })

    let due = await repository.findSummariesToSend({ limit: 50, maxAttempts: 5 })
    const mine = (rows: typeof due) => rows.filter((row) => row.companyId === companyId)
    expect(mine(due).map((row) => row.id)).toContain(refused)
    expect(mine(due).map((row) => row.id)).not.toContain(waiting)

    await database.execute(sql`
      update nfe_imports set status = 'completed', processed_count = 1, imported_count = 1
      where id = (select import_id from nfe_xml_receipts where id = ${waiting}::uuid)
    `)
    due = await repository.findSummariesToSend({ limit: 50, maxAttempts: 5 })
    const ready = mine(due).find((row) => row.id === waiting)
    expect(ready?.counts).toEqual({
      duplicated: 0,
      failed: 0,
      imported: 1,
      invalid: 0,
      received: 1,
      rejected: 0,
    })

    await repository.markSummarySent({ now: later(2), receiptId: waiting })
    due = await repository.findSummariesToSend({ limit: 50, maxAttempts: 5 })
    expect(mine(due).map((row) => row.id)).not.toContain(waiting)
  })

  test('per-item error codes of a finished import come back grouped as the problems of the summary', async () => {
    const { receiptId } = await record('m-problems')
    const { importId } = await importGateway.createImport({
      automationJob: null,
      companyId,
      correlationId: 'c',
      files: [
        { bytes: new TextEncoder().encode('<a/>'), name: 'a.zip' },
        { bytes: new TextEncoder().encode('<b/>'), name: 'b.zip' },
      ],
      receiptId,
      receivedFrom: '5516988887777',
      receivedVia: 'whatsapp',
      requestedByUserId: operatorId,
    })
    await database.execute(sql`
      update nfe_import_items set status = 'failed', error = '{"code":"ZIP_INVALID_ARCHIVE","message":"x"}'::jsonb
      where import_id = ${importId}::uuid
    `)
    await database.execute(sql`
      update nfe_imports set status = 'failed', processed_count = 2, failed_count = 2 where id = ${importId}::uuid
    `)
    const rows = await repository.findSummariesToSend({ limit: 200, maxAttempts: 5 })
    const row = rows.find((candidate) => candidate.id === receiptId)
    expect(row?.problems).toEqual([{ code: 'ZIP_INVALID_ARCHIVE', count: 2 }])
  })

  test('a failed summary send is counted and the receipt leaves the queue at the ceiling', async () => {
    const { receiptId } = await record('m-ceiling')
    await repository.markRejected({ now: later(1), reason: 'no_accepted_file', receiptId })
    for (let attempt = 0; attempt < 5; attempt += 1)
      await repository.markSummaryAttempt({ receiptId })
    const rows = await repository.findSummariesToSend({ limit: 500, maxAttempts: 5 })
    expect(rows.map((row) => row.id)).not.toContain(receiptId)
  })

  test('operators (company-admin and fiscal only) are the ones alerted about a final failure', async () => {
    const sent: { recipientUserId: string }[] = []
    const alerts = createReceiptOperatorAlertAdapter({
      database,
      send: (input) => {
        sent.push({ recipientUserId: input.recipientUserId })
        return Promise.resolve()
      },
    })
    await alerts.notifyFailure({
      channel: 'whatsapp',
      companyId,
      errorCode: 'Boom',
      receiptId: 'r-1',
    })
    expect(sent.map((entry) => entry.recipientUserId).sort()).toEqual([adminId])
  })
})
