/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6 contra Postgres: a prévia por e-mail nasce pelo mesmo desenho do upload (prévia, evento
 * `uploaded`, pedido ao worker), a mensagem é idempotente, o mesmo arquivo devolve a prévia existente,
 * o teto de abertas recusa e REGISTRA, e nada vaza entre empresas. Semeia em série (pool do Bun SQL).
 */
import { createHash } from 'node:crypto'

import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import type { AcceptedRecord } from '../../src/cargo-preview-email/application/cargo-preview-email.types.js'
import { intakeCargoPreviewEmail } from '../../src/cargo-preview-email/application/intake-cargo-preview-email.use-case.js'
import { hashPreviewInboundToken } from '../../src/cargo-preview-email/domain/preview-inbound-token.policy.js'
import { createDrizzleCargoPreviewEmailRepository } from '../../src/cargo-preview-email/infrastructure/drizzle-cargo-preview-email.repository.js'
import { FR_COLUMN_MAP } from '../fixtures/cargo-preview-workbook.fixture.js'
import { REPLY_DOMAIN, validRawEmail } from '../cargo-preview-email/intake.harness.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip
const TOKEN = 'previewtoken234567abcdefgh'
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

describeDatabase('a prévia por e-mail encaminhado (integration, spec 237 T4.6)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const repository = createDrizzleCargoPreviewEmailRepository(db)

  afterAll(async () => {
    await provider.close()
  })

  async function seedCompany(options: { readonly isEnabled?: boolean } = {}) {
    const companyId = crypto.randomUUID()
    const contractorId = crypto.randomUUID()
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`
      insert into contractors (id, company_id, tax_id) values (${contractorId}, ${companyId}, '30290856000160')`)
    await db.execute(sql`
      insert into contractor_receiving_profiles
        (company_id, contractor_id, is_enabled, preview_enabled, preview_column_map,
         preview_inbound_token_hash, preview_forwarder_allowlist, preview_sender_allowlist)
      values (${companyId}, ${contractorId}, ${options.isEnabled ?? true}, true,
        ${JSON.stringify(FR_COLUMN_MAP)}::text::jsonb, ${hashPreviewInboundToken(TOKEN)},
        '{"equipe@transportadora.example"}'::text[], '{"fr@contratante.example"}'::text[])`)
    return { companyId, contractorId }
  }

  function record(input: {
    readonly companyId: string
    readonly contractorId: string
    readonly emailId: string
    readonly fileSha256?: string
  }): AcceptedRecord {
    const fileSha256 = input.fileSha256 ?? sha256(`file-${input.emailId}`)
    const fileObjectId = crypto.randomUUID()
    return {
      companyId: input.companyId,
      contractorId: input.contractorId,
      correlationId: `corr-${input.emailId}`,
      dkimResult: 'aligned',
      file: {
        bucket: 'integration',
        fileName: 'FR-06-10.xlsm',
        fileObjectId,
        idempotencyKey: `email:${sha256(input.emailId)}`,
        objectKey: `tenants/${input.companyId}/cargo-previews/${fileObjectId}`,
        requestFingerprint: sha256(JSON.stringify([input.contractorId, fileSha256])),
        sha256: fileSha256,
        sizeBytes: 1234,
      },
      providerEmailId: input.emailId,
      raw: {
        bucket: 'integration',
        key: `tenants/${input.companyId}/contractor-mail/${input.emailId}/raw.eml`,
        mimeType: 'message/rfc822',
        provider: 'minio',
        sha256: sha256(`raw-${input.emailId}`),
        sizeBytes: 4321,
      },
      receivedAt: new Date('2026-10-06T14:59:00.000Z'),
    }
  }

  async function count(table: string, companyId: string): Promise<number> {
    const rows = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from ${sql.raw(table)} where company_id = ${companyId}`,
    )
    return [...rows][0]?.count ?? 0
  }

  test('acha o perfil pelo hash do token, só da empresa, e diz se a prévia está pronta', async () => {
    const [first, second, disabled] = [
      await seedCompany(),
      await seedCompany(),
      await seedCompany({ isEnabled: false }),
    ]
    const tokenHashes = [hashPreviewInboundToken(TOKEN)]

    const found = await repository.findProfilesByTokenHashes({
      companyId: first.companyId,
      tokenHashes,
    })
    expect(found).toEqual([
      {
        contractorId: first.contractorId,
        forwarderAllowlist: ['equipe@transportadora.example'],
        isPreviewReady: true,
        senderAllowlist: ['fr@contratante.example'],
      },
    ])
    expect(
      (await repository.findProfilesByTokenHashes({ companyId: second.companyId, tokenHashes }))[0]
        ?.contractorId,
    ).toBe(second.contractorId)
    expect(
      (
        await repository.findProfilesByTokenHashes({ companyId: disabled.companyId, tokenHashes })
      )[0]?.isPreviewReady,
    ).toBe(false)
    expect(
      await repository.findProfilesByTokenHashes({ companyId: crypto.randomUUID(), tokenHashes }),
    ).toEqual([])
    expect(
      await repository.findProfilesByTokenHashes({
        companyId: first.companyId,
        tokenHashes: [sha256('outro')],
      }),
    ).toEqual([])
  })

  test('cria a prévia como o upload: prévia na fila, evento `uploaded`, pedido ao worker, registro e MIME', async () => {
    const graph = await seedCompany()
    const accepted = record({ ...graph, emailId: 'email-a' })

    const outcome = await repository.createPreview(accepted)
    expect(outcome.kind).toBe('created')
    const previewId = outcome.kind === 'created' ? outcome.previewId : ''

    const [preview] = [
      ...(await db.execute<Record<string, unknown>>(
        sql`select source, status, uploaded_by_user_id, idempotency_key, request_fingerprint, file_name,
              file_sha256, file_size_bytes, received_at from cargo_previews where id = ${previewId}`,
      )),
    ]
    expect(preview).toMatchObject({
      file_name: 'FR-06-10.xlsm',
      file_sha256: accepted.file.sha256,
      file_size_bytes: 1234,
      idempotency_key: accepted.file.idempotencyKey,
      request_fingerprint: accepted.file.requestFingerprint,
      source: 'email',
      status: 'queued',
      uploaded_by_user_id: null,
    })
    expect(new Date(preview?.received_at as string).toISOString()).toBe('2026-10-06T14:59:00.000Z')

    const [event] = [
      ...(await db.execute<Record<string, unknown>>(
        sql`select kind, channel, actor_user_id, details from cargo_preview_events where preview_id = ${previewId}`,
      )),
    ]
    expect(event).toMatchObject({ actor_user_id: null, channel: 'worker', kind: 'uploaded' })
    expect(event?.details).toEqual({ fileSizeBytes: 1234, source: 'email' })

    const [outbox] = [
      ...(await db.execute<Record<string, unknown>>(
        sql`select event_type, correlation_id, payload, contractor_id from cargo_preview_outbox where preview_id = ${previewId}`,
      )),
    ]
    expect(outbox).toMatchObject({
      contractor_id: graph.contractorId,
      correlation_id: 'corr-email-a',
      event_type: 'cargo-preview.process',
    })
    expect(outbox?.payload).toEqual({
      bucket: 'integration',
      objectKey: accepted.file.objectKey,
      previewId,
    })

    const [intake] = [
      ...(await db.execute<Record<string, unknown>>(
        sql`select outcome, reason_code, preview_id, is_replay, forwarder_dkim_result,
              original_sender_verification, raw_object_id, contractor_id from cargo_preview_email_intakes
            where company_id = ${graph.companyId}`,
      )),
    ]
    expect(intake).toMatchObject({
      contractor_id: graph.contractorId,
      forwarder_dkim_result: 'aligned',
      is_replay: false,
      original_sender_verification: 'unverified',
      outcome: 'accepted',
      preview_id: previewId,
      reason_code: null,
    })
    const [raw] = [
      ...(await db.execute<Record<string, unknown>>(
        sql`select id, purpose, mime_type, sha256, size_bytes from stored_objects where company_id = ${graph.companyId}`,
      )),
    ]
    expect(raw).toMatchObject({
      mime_type: 'message/rfc822',
      purpose: 'contractor_mail_raw',
      sha256: accepted.raw.sha256,
    })
    expect(intake?.raw_object_id).toBe(raw?.id)
  })

  test('a mesma mensagem reprocessada não cria nada de novo, nem sob corrida', async () => {
    const graph = await seedCompany()
    const accepted = record({ ...graph, emailId: 'email-b' })
    const outcomes = await Promise.all([
      repository.createPreview(accepted),
      repository.createPreview(accepted),
    ])
    expect(outcomes.map((item) => item.kind).sort()).toEqual(['already_recorded', 'created'])
    expect(await repository.createPreview(accepted)).toEqual({
      isRawKept: true,
      kind: 'already_recorded',
    })
    expect(
      await repository.hasIntake({ companyId: graph.companyId, providerEmailId: 'email-b' }),
    ).toBe(true)
    expect(
      await repository.hasIntake({ companyId: crypto.randomUUID(), providerEmailId: 'email-b' }),
    ).toBe(false)
    expect(await count('cargo_previews', graph.companyId)).toBe(1)
    expect(await count('cargo_preview_outbox', graph.companyId)).toBe(1)
    expect(await count('cargo_preview_events', graph.companyId)).toBe(1)
    expect(await count('cargo_preview_email_intakes', graph.companyId)).toBe(1)
    expect(await count('stored_objects', graph.companyId)).toBe(1)
  })

  test('o mesmo arquivo em outra mensagem devolve a prévia existente e registra o reenvio', async () => {
    const graph = await seedCompany()
    const file = sha256('mesmo-arquivo')
    const first = await repository.createPreview(
      record({ ...graph, emailId: 'email-c1', fileSha256: file }),
    )
    const second = await repository.createPreview(
      record({ ...graph, emailId: 'email-c2', fileSha256: file }),
    )
    expect(first.kind).toBe('created')
    expect(second).toEqual({
      kind: 'replayed',
      previewId: first.kind === 'created' ? first.previewId : '',
      previewStatus: 'queued',
    })
    expect(await count('cargo_previews', graph.companyId)).toBe(1)
    expect(await count('cargo_preview_outbox', graph.companyId)).toBe(1)
    const rows = [
      ...(await db.execute<{ is_replay: boolean }>(
        sql`select is_replay from cargo_preview_email_intakes where company_id = ${graph.companyId} order by is_replay`,
      )),
    ]
    expect(rows.map((row) => row.is_replay)).toEqual([false, true])
  })

  test('duas mensagens com o mesmo arquivo ao mesmo tempo criam uma prévia só', async () => {
    const graph = await seedCompany()
    const file = sha256('arquivo-em-corrida')
    const outcomes = await Promise.all([
      repository.createPreview(record({ ...graph, emailId: 'email-d1', fileSha256: file })),
      repository.createPreview(record({ ...graph, emailId: 'email-d2', fileSha256: file })),
    ])
    expect(outcomes.map((item) => item.kind).sort()).toEqual(['created', 'replayed'])
    expect(await count('cargo_previews', graph.companyId)).toBe(1)
  })

  test('com cinco prévias abertas, recusa, registra o motivo e não grava MIME nem prévia', async () => {
    const graph = await seedCompany()
    for (let index = 0; index < 5; index += 1) {
      await repository.createPreview(record({ ...graph, emailId: `email-e${index}` }))
    }
    expect(await count('cargo_previews', graph.companyId)).toBe(5)

    const outcome = await repository.createPreview(record({ ...graph, emailId: 'email-e5' }))
    expect(outcome).toEqual({ kind: 'too_many_open' })
    expect(await count('cargo_previews', graph.companyId)).toBe(5)
    expect(await count('stored_objects', graph.companyId)).toBe(5)
    const [rejected] = [
      ...(await db.execute<Record<string, unknown>>(
        sql`select outcome, reason_code, preview_id, raw_object_id, forwarder_dkim_result
            from cargo_preview_email_intakes where company_id = ${graph.companyId} and provider_email_id = 'email-e5'`,
      )),
    ]
    expect(rejected).toEqual({
      forwarder_dkim_result: 'aligned',
      outcome: 'rejected',
      preview_id: null,
      raw_object_id: null,
      reason_code: 'TOO_MANY_OPEN_PREVIEWS',
    })
    // A reentrega dessa mensagem recusada não tem MIME registrado: quem a repete pode apagar o seu.
    expect(await repository.createPreview(record({ ...graph, emailId: 'email-e5' }))).toEqual({
      isRawKept: false,
      kind: 'already_recorded',
    })
  })

  test('a recusa é registrada uma vez só, com o motivo e sem endereço', async () => {
    const graph = await seedCompany()
    const rejection = {
      companyId: graph.companyId,
      contractorId: graph.contractorId,
      dkimResult: 'not_aligned' as const,
      isOriginalSenderRead: false,
      providerEmailId: 'email-f',
      reason: 'FORWARDER_DKIM_NOT_ALIGNED' as const,
      receivedAt: new Date('2026-10-06T15:00:00.000Z'),
    }
    await repository.recordRejection(rejection)
    await repository.recordRejection(rejection)
    const rows = [
      ...(await db.execute<Record<string, unknown>>(
        sql`select outcome, reason_code, forwarder_dkim_result, original_sender_verification, preview_id
            from cargo_preview_email_intakes where company_id = ${graph.companyId}`,
      )),
    ]
    expect(rows).toEqual([
      {
        forwarder_dkim_result: 'not_aligned',
        original_sender_verification: null,
        outcome: 'rejected',
        preview_id: null,
        reason_code: 'FORWARDER_DKIM_NOT_ALIGNED',
      },
    ])
  })

  /** Semeia a janela direto: `recorded_at` é o relógio do banco, e o teste o escolhe para provar isso. */
  async function seedIntake(input: {
    readonly companyId: string
    readonly contractorId: string
    readonly dkim: string | null
    readonly emailId: string
    readonly minutesAgo: number
    readonly reason: string
    readonly receivedMinutesAgo?: number
  }): Promise<void> {
    const receivedAgo = input.receivedMinutesAgo ?? input.minutesAgo
    await db.execute(sql`
      insert into cargo_preview_email_intakes
        (company_id, provider_email_id, contractor_id, outcome, reason_code, forwarder_dkim_result,
         received_at, recorded_at)
      values (${input.companyId}, ${input.emailId}, ${input.contractorId}, 'rejected', ${input.reason},
        ${input.dkim}, now() - make_interval(mins => ${receivedAgo}),
        now() - make_interval(mins => ${input.minutesAgo}))`)
  }

  test('a janela conta os que passaram do DKIM à parte dos anteriores a ele, pelo relógio do banco', async () => {
    const graph = await seedCompany()
    const other = await seedCompany()
    const base = { companyId: graph.companyId, contractorId: graph.contractorId }
    await seedIntake({
      ...base,
      dkim: 'aligned',
      emailId: 'w1',
      minutesAgo: 1,
      reason: 'ATTACHMENT_MISSING',
    })
    await seedIntake({
      ...base,
      dkim: 'aligned',
      emailId: 'w2',
      minutesAgo: 2,
      reason: 'ORIGINAL_SENDER_NOT_ALLOWED',
    })
    await seedIntake({
      ...base,
      dkim: 'not_aligned',
      emailId: 'w3',
      minutesAgo: 1,
      reason: 'FORWARDER_DKIM_NOT_ALIGNED',
    })
    await seedIntake({
      ...base,
      dkim: 'unverifiable',
      emailId: 'w4',
      minutesAgo: 1,
      reason: 'FORWARDER_DKIM_UNVERIFIABLE',
    })
    await seedIntake({
      ...base,
      dkim: null,
      emailId: 'w5',
      minutesAgo: 1,
      reason: 'FORWARDER_NOT_ALLOWED',
    })
    await seedIntake({
      ...base,
      dkim: null,
      emailId: 'w6',
      minutesAgo: 1,
      reason: 'MIME_UNREADABLE',
    })
    // O rastro do excesso não é e-mail processado: fica fora dos dois contadores.
    await seedIntake({ ...base, dkim: null, emailId: 'w7', minutesAgo: 1, reason: 'RATE_LIMITED' })
    // Fora da janela de 5 minutos.
    await seedIntake({
      ...base,
      dkim: 'aligned',
      emailId: 'w8',
      minutesAgo: 10,
      reason: 'ATTACHMENT_MISSING',
    })
    // Data de recebimento antiga, mas gravado agora: conta (o remetente não escolhe a janela).
    await seedIntake({
      ...base,
      dkim: 'aligned',
      emailId: 'w9',
      minutesAgo: 1,
      receivedMinutesAgo: 1440,
      reason: 'ATTACHMENT_MISSING',
    })
    // Data de recebimento de agora, mas gravado há 10 minutos: não conta.
    await seedIntake({
      ...base,
      dkim: 'aligned',
      emailId: 'w10',
      minutesAgo: 10,
      receivedMinutesAgo: 0,
      reason: 'ATTACHMENT_MISSING',
    })

    const window = { ...base, windowSeconds: 300 }
    expect(await repository.countRecentIntakes(window)).toEqual({
      authenticated: 3,
      unauthenticated: 4,
    })
    expect(await repository.countRecentIntakes({ ...window, windowSeconds: 30 * 60 * 60 })).toEqual(
      { authenticated: 5, unauthenticated: 4 },
    )
    expect(
      await repository.countRecentIntakes({ ...window, contractorId: other.contractorId }),
    ).toEqual({ authenticated: 0, unauthenticated: 0 })
    expect(await repository.countRecentIntakes({ ...window, companyId: other.companyId })).toEqual({
      authenticated: 0,
      unauthenticated: 0,
    })
  })

  test('o excesso deixa um rastro por janela e contratante, sem virar outra inundação', async () => {
    const graph = await seedCompany()
    const other = await seedCompany()
    const marker = (emailId: string, target = graph) => ({
      companyId: target.companyId,
      contractorId: target.contractorId,
      providerEmailId: emailId,
      receivedAt: new Date('2026-10-06T15:00:00.000Z'),
      windowSeconds: 300,
    })
    await repository.recordRateLimited(marker('r1'))
    await repository.recordRateLimited(marker('r2'))
    await repository.recordRateLimited(marker('r1'))
    await repository.recordRateLimited(marker('r3', other))
    const rows = (companyId: string) =>
      db.execute<Record<string, unknown>>(
        sql`select provider_email_id, outcome, reason_code, forwarder_dkim_result, preview_id, raw_object_id
            from cargo_preview_email_intakes where company_id = ${companyId}`,
      )
    expect([...(await rows(graph.companyId))]).toEqual([
      {
        forwarder_dkim_result: null,
        outcome: 'rejected',
        preview_id: null,
        provider_email_id: 'r1',
        raw_object_id: null,
        reason_code: 'RATE_LIMITED',
      },
    ])
    expect([...(await rows(other.companyId))]).toHaveLength(1)

    // Passada a janela, o próximo excesso deixa um novo rastro.
    const third = await seedCompany()
    await seedIntake({
      companyId: third.companyId,
      contractorId: third.contractorId,
      dkim: null,
      emailId: 'r-old',
      minutesAgo: 10,
      reason: 'RATE_LIMITED',
    })
    await repository.recordRateLimited(marker('r4', third))
    expect([...(await rows(third.companyId))].map((row) => row.provider_email_id).sort()).toEqual([
      'r-old',
      'r4',
    ])
  })

  test('de ponta a ponta: o MIME encaminhado vira prévia na fila e o reenvio não duplica', async () => {
    const graph = await seedCompany()
    const stored: string[] = []
    const dependencies = {
      dkimVerifier: { verify: async () => 'aligned' as const },
      mailGateway: { downloadRawEmail: async () => Buffer.from(validRawEmail()) },
      newId: () => crypto.randomUUID(),
      repository,
      storage: {
        deleteObject: async () => undefined,
        storeObject: async ({ key }: { readonly key: string }) => void stored.push(key),
      },
      storageBucket: 'integration',
      storageProvider: 'minio',
    }
    const input = (providerEmailId: string) => ({
      companyId: graph.companyId,
      correlationId: 'corr-e2e',
      delivery: { isLastAttempt: false },
      occurredAt: new Date('2026-10-06T14:59:00.000Z'),
      providerEmailId,
      received: {
        from: 'Equipe <equipe@transportadora.example>',
        headers: {},
        message_id: '<outer@forwarder.example>',
        raw: {
          download_url: 'https://abc.cloudfront.net/raw/1',
          expires_at: '2099-01-01T00:00:00Z',
        },
        subject: 'Fwd: previa',
        text: 'segue',
        to: [`${TOKEN}@${REPLY_DOMAIN}`],
      },
      replyDomain: REPLY_DOMAIN,
    })

    const first = await intakeCargoPreviewEmail(input('email-z1'), dependencies)
    expect(first).toMatchObject({ kind: 'accepted' })
    const second = await intakeCargoPreviewEmail(input('email-z2'), dependencies)
    expect(second).toMatchObject({ kind: 'replayed_existing', previewStatus: 'queued' })
    expect(await intakeCargoPreviewEmail(input('email-z1'), dependencies)).toEqual({
      kind: 'already_recorded',
    })
    expect(await count('cargo_previews', graph.companyId)).toBe(1)
    expect(await count('cargo_preview_outbox', graph.companyId)).toBe(1)
    expect(await count('cargo_preview_email_intakes', graph.companyId)).toBe(2)
    const rejected = await intakeCargoPreviewEmail(input('email-z3'), {
      ...dependencies,
      dkimVerifier: { verify: async () => 'absent' as const },
    })
    expect(rejected).toMatchObject({ kind: 'rejected', reason: 'FORWARDER_DKIM_NOT_ALIGNED' })
    expect(await count('cargo_previews', graph.companyId)).toBe(1)
  })

  test('reentrega concorrente da mesma mensagem: a vencedora mantém o MIME no bucket e a linha final', async () => {
    const graph = await seedCompany()
    const present = new Set<string>()
    const dependencies = {
      dkimVerifier: { verify: async () => 'aligned' as const },
      mailGateway: { downloadRawEmail: async () => Buffer.from(validRawEmail()) },
      newId: () => crypto.randomUUID(),
      repository,
      storage: {
        deleteObject: async ({ key }: { readonly key: string }) => void present.delete(key),
        storeObject: async ({ key }: { readonly key: string }) => void present.add(key),
      },
      storageBucket: 'integration',
      storageProvider: 'minio',
    }
    const input = {
      companyId: graph.companyId,
      correlationId: 'corr-race',
      delivery: { isLastAttempt: false },
      occurredAt: new Date('2026-10-06T14:59:00.000Z'),
      providerEmailId: 'email-race',
      received: {
        from: 'Equipe <equipe@transportadora.example>',
        headers: {},
        message_id: '<outer@forwarder.example>',
        raw: {
          download_url: 'https://abc.cloudfront.net/raw/1',
          expires_at: '2099-01-01T00:00:00Z',
        },
        subject: 'Fwd: previa',
        text: 'segue',
        to: [`${TOKEN}@${REPLY_DOMAIN}`],
      },
      replyDomain: REPLY_DOMAIN,
    }

    const results = await Promise.all([
      intakeCargoPreviewEmail(input, dependencies),
      intakeCargoPreviewEmail(input, dependencies),
    ])
    expect(results.map((result) => result.kind).sort()).toEqual(['accepted', 'already_recorded'])

    const rawKey = `tenants/${graph.companyId}/contractor-mail/email-race/raw.eml`
    expect(present.has(rawKey)).toBe(true)
    expect([...present].filter((key) => key.includes('cargo-previews'))).toHaveLength(1)
    const [raw] = [
      ...(await db.execute<Record<string, unknown>>(
        sql`select status, object_key from stored_objects where company_id = ${graph.companyId}`,
      )),
    ]
    expect(raw).toEqual({ object_key: rawKey, status: 'final' })
    expect(await count('cargo_previews', graph.companyId)).toBe(1)
  })

  test('o registro dos e-mails é append-only no banco', async () => {
    const graph = await seedCompany()
    await repository.createPreview(record({ ...graph, emailId: 'email-h' }))
    const update = async () => {
      await db.execute(
        sql`update cargo_preview_email_intakes set is_replay = true where company_id = ${graph.companyId}`,
      )
    }
    await expect(update()).rejects.toThrow()
  })
})
