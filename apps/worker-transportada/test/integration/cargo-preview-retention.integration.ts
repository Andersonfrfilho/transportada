/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.8 contra Postgres: 90 dias depois de a prévia ficar sem item em aberto, o arquivo e o
 * MIME bruto saem do bucket (a linha de `stored_objects` fica, `deleted`), os quatro campos pessoais
 * dos itens são anulados, e o evento `retention_applied` fecha a prévia uma única vez. Semeia em série
 * (pool do Bun SQL) e usa um bucket em memória: o MinIO é privado e a CI não o sobe.
 */
import { createHash } from 'node:crypto'

import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { buildCargoPreviewMatchLockKey } from '../../src/cargo-preview/domain/cargo-preview-lock.policy.js'
import { createDrizzleApplyCargoPreviewRetentionBatch } from '../../src/cargo-preview-retention/infrastructure/drizzle-cargo-preview-retention.repository.js'
import { CARGO_PREVIEW_RETENTION_MAX_OBJECTS_PER_PREVIEW } from '../../src/cargo-preview-retention/domain/cargo-preview-retention.constant.js'
import {
  createCargoPreviewGraph,
  type CargoPreviewGraph,
} from '../fixtures/cargo-preview-graph.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const NOW = new Date('2026-12-31T12:00:00.000Z')
const DAY_MS = 86_400_000
const daysAgo = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY_MS + extraMs)
const hexOf = (value: string) => createHash('sha256').update(value).digest('hex')
const PII_COLUMNS = ['recipient_name', 'address', 'neighborhood', 'postal_code'] as const

type SeedItem = {
  readonly decidedByUser?: boolean
  readonly state: 'ambiguous' | 'awaiting_xml' | 'invalid' | 'matched' | 'suggested'
  readonly updatedAt: Date
}
type SeedPreview = {
  readonly extraIntakes?: number
  readonly items: readonly SeedItem[]
  readonly source?: 'email' | 'upload'
  readonly status?: 'failed' | 'queued' | 'ready'
  readonly updatedAt: Date
}
type Seeded = {
  readonly fileObjectId: string
  readonly previewId: string
  readonly rawObjectIds: readonly string[]
}

describeDatabase('a retenção de 90 dias dos dados da planilha (integration, spec 237 T4.8)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const bucket = new Map<string, true>()
  const failingKeys = new Set<string>()
  const deleteCalls: string[] = []
  let graph: CargoPreviewGraph
  let userId = ''

  const apply = createDrizzleApplyCargoPreviewRetentionBatch({
    database: db,
    deleteObject: async ({ key }) => {
      deleteCalls.push(key)
      if (failingKeys.has(key)) throw new Error('bucket offline')
      bucket.delete(key)
    },
  })

  beforeAll(async () => {
    graph = await createCargoPreviewGraph(db)
    userId = crypto.randomUUID()
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(sql`
      insert into user_company_memberships (id, user_id, company_id, status)
      values (${crypto.randomUUID()}, ${userId}, ${graph.companyId}, 'active')`)
  })

  afterAll(async () => {
    await provider.close()
  })

  async function seedObject(purpose: 'contractor_mail_raw' | 'import_source'): Promise<string> {
    const id = crypto.randomUUID()
    const key = `tenants/${graph.companyId}/${purpose}/${id}`
    bucket.set(key, true)
    await db.execute(sql`
      insert into stored_objects (id, company_id, provider, bucket, object_key, purpose, mime_type,
        sha256, size_bytes, status)
      values (${id}, ${graph.companyId}, 's3', 'integration', ${key}, ${purpose},
        'application/octet-stream', ${hexOf(id)}, 100, 'final')`)
    return id
  }

  async function seedPreview(input: SeedPreview): Promise<Seeded> {
    const previewId = crypto.randomUUID()
    const source = input.source ?? 'email'
    const status = input.status ?? 'ready'
    const fileObjectId = await seedObject('import_source')
    const sha = hexOf(previewId)
    await db.execute(sql`
      insert into cargo_previews (id, company_id, contractor_id, source, status, received_at,
        file_name, file_sha256, file_object_id, file_size_bytes, row_count, error_code,
        uploaded_by_user_id, idempotency_key, request_fingerprint, updated_at)
      values (${previewId}, ${graph.companyId}, ${graph.contractorId}, ${source}, ${status},
        ${daysAgo(200)}, 'FR-05-10.xlsm', ${sha}, ${fileObjectId}, 100,
        ${status === 'ready' ? input.items.length : null},
        ${status === 'failed' ? 'PREVIEW_FILE_CORRUPTED' : null},
        ${source === 'upload' ? userId : null}, ${`preview-key-${previewId}`}, ${sha},
        ${input.updatedAt})`)
    for (const [index, item] of input.items.entries()) await seedItem(previewId, index + 1, item)
    const rawObjectIds: string[] = []
    if (source === 'email') {
      for (let index = 0; index <= (input.extraIntakes ?? 0); index += 1) {
        const rawObjectId = await seedObject('contractor_mail_raw')
        rawObjectIds.push(rawObjectId)
        await db.execute(sql`
          insert into cargo_preview_email_intakes (company_id, provider_email_id, contractor_id,
            outcome, preview_id, is_replay, forwarder_dkim_result, raw_object_id, received_at)
          values (${graph.companyId}, ${`email-${previewId}-${index}`}, ${graph.contractorId},
            'accepted', ${previewId}, ${index > 0}, 'aligned', ${rawObjectId}, ${daysAgo(200)})`)
      }
    }
    return { fileObjectId, previewId, rawObjectIds }
  }

  async function seedItem(previewId: string, rowNumber: number, item: SeedItem): Promise<void> {
    const isMatched = item.state === 'matched'
    const isInvalid = item.state === 'invalid'
    const documentId = isMatched
      ? await graph.seedDocument({
          bare: true,
          number: String(rowNumber),
          recipientTaxId: '11222333000181',
          value: '10.00',
          weightKg: null,
        })
      : undefined
    if (documentId !== undefined) {
      await db.execute(sql`
        insert into cargo_preview_document_links (company_id, preview_id, document_id, linked_by)
        values (${graph.companyId}, ${previewId}, ${documentId}, 'system')`)
    }
    const decidedBy = isMatched ? (item.decidedByUser === true ? 'user' : 'system') : null
    await db.execute(sql`
      insert into cargo_preview_items (company_id, preview_id, row_number, route_name,
        recipient_code, recipient_name, weight_kg, value, address, neighborhood, city, state,
        postal_code, contractor_reference, match_state, matched_document_id, matched_at,
        matched_by, matched_by_user_id, row_error, updated_at)
      values (${graph.companyId}, ${previewId}, ${rowNumber},
        ${isInvalid ? null : 'ROTA 7'}, 'C-100', 'MERCADO DA ESQUINA LTDA',
        ${isInvalid ? null : '12.500'}, ${isInvalid ? null : '99.90'}, 'RUA DAS FLORES, 10',
        'CENTRO', 'SAO CARLOS', 'SP', '13560000', 'REF-9', ${item.state}, ${documentId ?? null},
        ${decidedBy === null ? null : item.updatedAt}, ${decidedBy},
        ${decidedBy === 'user' ? userId : null},
        ${isInvalid ? JSON.stringify([{ column: 'Valor', field: 'value', message: 'Required' }]) : null}::text::jsonb,
        ${item.updatedAt})`)
  }

  async function run(limit = 25, excluded: readonly string[] = []) {
    return apply({ excludedPreviewIds: excluded, limit, now: NOW })
  }

  async function readItems(previewId: string) {
    return [
      ...(await db.execute<Record<string, unknown>>(sql`
        select id, route_name, weight_kg::text as weight_kg, value::text as value, city, state,
          recipient_code, contractor_reference, match_state, matched_document_id, matched_by,
          matched_by_user_id, matched_at, updated_at, row_error, match_group_key,
          recipient_name, address, neighborhood, postal_code
        from cargo_preview_items where preview_id = ${previewId} order by row_number`)),
    ]
  }

  async function readObjects(ids: readonly string[]) {
    return [
      ...(await db.execute<{
        id: string
        status: string
        deleted_at: Date | null
        object_key: string
      }>(sql`
        select id, status, deleted_at, object_key from stored_objects
        where id in (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}) order by id`)),
    ]
  }

  async function countEvents(previewId: string): Promise<number> {
    const rows = await db.execute<{ count: number }>(sql`
      select count(*)::int as count from cargo_preview_events
      where preview_id = ${previewId} and kind = 'retention_applied'`)
    return [...rows][0]?.count ?? 0
  }

  test('retém a prévia pronta há 90 dias: bucket, quatro campos, evento — e preserva o resto', async () => {
    const seeded = await seedPreview({
      extraIntakes: 1,
      items: [
        { state: 'matched', updatedAt: daysAgo(100) },
        { decidedByUser: true, state: 'matched', updatedAt: daysAgo(95) },
        { state: 'invalid', updatedAt: daysAgo(100) },
      ],
      updatedAt: daysAgo(100),
    })
    const before = await readItems(seeded.previewId)
    const rawKeys = (await readObjects(seeded.rawObjectIds)).map((row) => row.object_key)

    const result = await run()

    expect(result.retained).toBeGreaterThanOrEqual(1)
    const after = await readItems(seeded.previewId)
    expect(after).toHaveLength(3)
    for (const [index, row] of after.entries()) {
      for (const column of PII_COLUMNS) expect(row[column]).toBeNull()
      const kept = Object.fromEntries(
        Object.entries(row).filter(([name]) => !(PII_COLUMNS as readonly string[]).includes(name)),
      )
      const original = Object.fromEntries(
        Object.entries(before[index] ?? {}).filter(
          ([name]) => !(PII_COLUMNS as readonly string[]).includes(name),
        ),
      )
      expect(kept).toEqual(original)
    }
    const objects = await readObjects([seeded.fileObjectId, ...seeded.rawObjectIds])
    expect(objects).toHaveLength(3)
    for (const object of objects) {
      expect(object.status).toBe('deleted')
      expect(object.deleted_at).not.toBeNull()
      expect(bucket.has(object.object_key)).toBe(false)
    }
    expect(rawKeys).toHaveLength(2)
    const links = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from cargo_preview_document_links where preview_id = ${seeded.previewId}`,
    )
    expect([...links][0]?.count).toBe(2)
    const intakes = await db.execute<{ raw_object_id: string }>(
      sql`select raw_object_id from cargo_preview_email_intakes where preview_id = ${seeded.previewId}`,
    )
    expect([...intakes].map((row) => row.raw_object_id).sort()).toEqual(
      [...seeded.rawObjectIds].sort(),
    )
    expect(await countEvents(seeded.previewId)).toBe(1)
  })

  test('o evento é da prévia inteira, canal worker, só com contagens', async () => {
    const seeded = await seedPreview({
      items: [{ state: 'matched', updatedAt: daysAgo(120) }],
      updatedAt: daysAgo(120),
    })

    await run()

    const [event] = [
      ...(await db.execute<{
        actor_user_id: string | null
        channel: string
        details: Record<string, unknown>
        item_id: string | null
        occurred_at: Date
      }>(sql`select actor_user_id, channel, details, item_id, occurred_at from cargo_preview_events
        where preview_id = ${seeded.previewId} and kind = 'retention_applied'`)),
    ]
    expect(event?.channel).toBe('worker')
    expect(event?.actor_user_id).toBeNull()
    expect(event?.item_id).toBeNull()
    expect(event?.occurred_at.toISOString()).toBe(NOW.toISOString())
    expect(event?.details).toEqual({ itemsAnonymized: 1, objectsDeleted: 2, retentionDays: 90 })
  })

  test('rodar de novo não reprocessa nem duplica o evento', async () => {
    const seeded = await seedPreview({
      items: [{ state: 'matched', updatedAt: daysAgo(100) }],
      updatedAt: daysAgo(100),
    })
    await run()
    const callsAfterFirst = deleteCalls.length

    const second = await run()

    expect(second.retained).toBe(0)
    expect(deleteCalls).toHaveLength(callsAfterFirst)
    expect(await countEvents(seeded.previewId)).toBe(1)
  })

  test('prazo exato: 90 dias vence, 89 dias e 23h59 não', async () => {
    const exact = await seedPreview({
      items: [{ state: 'matched', updatedAt: daysAgo(90) }],
      updatedAt: daysAgo(90),
    })
    const almost = await seedPreview({
      items: [{ state: 'matched', updatedAt: daysAgo(90, 1) }],
      updatedAt: daysAgo(90, 1),
    })
    const eightyNine = await seedPreview({
      items: [{ state: 'matched', updatedAt: daysAgo(89) }],
      updatedAt: daysAgo(89),
    })

    await run()

    expect(await countEvents(exact.previewId)).toBe(1)
    expect(await countEvents(almost.previewId)).toBe(0)
    expect(await countEvents(eightyNine.previewId)).toBe(0)
    expect((await readItems(almost.previewId))[0]?.recipient_name).toBe('MERCADO DA ESQUINA LTDA')
  })

  test('o último movimento é o mais recente entre os itens e a própria prévia', async () => {
    const recentItem = await seedPreview({
      items: [
        { state: 'matched', updatedAt: daysAgo(200) },
        { state: 'matched', updatedAt: daysAgo(10) },
      ],
      updatedAt: daysAgo(200),
    })
    const recentPreview = await seedPreview({
      items: [{ state: 'matched', updatedAt: daysAgo(200) }],
      updatedAt: daysAgo(10),
    })

    await run()

    expect(await countEvents(recentItem.previewId)).toBe(0)
    expect(await countEvents(recentPreview.previewId)).toBe(0)
  })

  test('prévia com item em aberto NUNCA é tocada, qualquer que seja a idade', async () => {
    const ids: Seeded[] = []
    for (const state of ['awaiting_xml', 'suggested', 'ambiguous'] as const) {
      ids.push(
        await seedPreview({
          items: [
            { state: 'matched', updatedAt: daysAgo(400) },
            { state, updatedAt: daysAgo(400) },
          ],
          updatedAt: daysAgo(400),
        }),
      )
    }

    await run()

    for (const seeded of ids) {
      expect(await countEvents(seeded.previewId)).toBe(0)
      const objects = await readObjects([seeded.fileObjectId, ...seeded.rawObjectIds])
      expect(objects.every((object) => object.status === 'final')).toBe(true)
      expect((await readItems(seeded.previewId))[0]?.address).toBe('RUA DAS FLORES, 10')
    }
  })

  test('prévia na fila ou em leitura não perde o arquivo; a que falhou, sim', async () => {
    const queued = await seedPreview({ items: [], status: 'queued', updatedAt: daysAgo(400) })
    const failed = await seedPreview({ items: [], status: 'failed', updatedAt: daysAgo(400) })

    await run()

    expect(await countEvents(queued.previewId)).toBe(0)
    expect(await countEvents(failed.previewId)).toBe(1)
    expect((await readObjects([failed.fileObjectId]))[0]?.status).toBe('deleted')
  })

  test('prévia de upload não tem MIME bruto e fecha do mesmo jeito', async () => {
    const seeded = await seedPreview({
      items: [{ state: 'matched', updatedAt: daysAgo(100) }],
      source: 'upload',
      updatedAt: daysAgo(100),
    })

    await run()

    expect(seeded.rawObjectIds).toHaveLength(0)
    expect(await countEvents(seeded.previewId)).toBe(1)
    expect((await readObjects([seeded.fileObjectId]))[0]?.status).toBe('deleted')
  })

  test('objeto já apagado converge: sem novo delete no bucket, e a prévia fecha', async () => {
    const seeded = await seedPreview({
      items: [{ state: 'matched', updatedAt: daysAgo(100) }],
      updatedAt: daysAgo(100),
    })
    await db.execute(sql`
      update stored_objects set status = 'deleted', deleted_at = now()
      where id = ${seeded.fileObjectId}`)
    const key = (await readObjects([seeded.fileObjectId]))[0]?.object_key ?? ''
    const callsBefore = deleteCalls.length

    await run()

    expect(deleteCalls.slice(callsBefore)).not.toContain(key)
    expect(await countEvents(seeded.previewId)).toBe(1)
  })

  test('falha de bucket numa prévia não derruba as outras e ela não é marcada: volta depois', async () => {
    const broken = await seedPreview({
      items: [{ state: 'matched', updatedAt: daysAgo(100) }],
      updatedAt: daysAgo(100),
    })
    const healthy = await seedPreview({
      items: [{ state: 'matched', updatedAt: daysAgo(100) }],
      updatedAt: daysAgo(100),
    })
    const brokenKey = (await readObjects([broken.fileObjectId]))[0]?.object_key ?? ''
    failingKeys.add(brokenKey)

    const first = await run()

    expect(first.failed).toBe(1)
    expect(first.deferredPreviewIds).toContain(broken.previewId)
    expect(await countEvents(healthy.previewId)).toBe(1)
    expect(await countEvents(broken.previewId)).toBe(0)
    expect((await readItems(broken.previewId))[0]?.recipient_name).toBe('MERCADO DA ESQUINA LTDA')
    expect((await readObjects([broken.fileObjectId]))[0]?.status).toBe('final')

    failingKeys.delete(brokenKey)
    const second = await run()

    expect(second.retained).toBe(1)
    expect(await countEvents(broken.previewId)).toBe(1)
  })

  test('o lote respeita o limite e o que sobra continua na próxima passada', async () => {
    const seededIds: string[] = []
    for (let index = 0; index < 3; index += 1) {
      seededIds.push(
        (
          await seedPreview({
            items: [{ state: 'matched', updatedAt: daysAgo(100) }],
            updatedAt: daysAgo(100),
          })
        ).previewId,
      )
    }

    const first = await run(2)
    expect(first.processed).toBe(2)
    const second = await run(2)
    expect(second.processed).toBeGreaterThanOrEqual(1)

    const events = await Promise.all(seededIds.map((id) => countEvents(id)))
    expect(events).toEqual([1, 1, 1])
  })

  test('o teto de objetos por prévia: o evento só sai quando o último objeto some', async () => {
    const seeded = await seedPreview({
      extraIntakes: CARGO_PREVIEW_RETENTION_MAX_OBJECTS_PER_PREVIEW + 1,
      items: [{ state: 'matched', updatedAt: daysAgo(100) }],
      updatedAt: daysAgo(100),
    })

    const first = await run()

    expect(first.partial).toBe(1)
    expect(await countEvents(seeded.previewId)).toBe(0)
    expect((await readItems(seeded.previewId))[0]?.address).toBeNull()

    const second = await run()

    expect(second.retained).toBe(1)
    expect(await countEvents(seeded.previewId)).toBe(1)
    const objects = await readObjects([seeded.fileObjectId, ...seeded.rawObjectIds])
    expect(objects.every((object) => object.status === 'deleted')).toBe(true)
  })

  test('com o operador na prévia (trava do contratante) a retenção espera a próxima execução', async () => {
    const seeded = await seedPreview({
      items: [{ state: 'matched', updatedAt: daysAgo(100) }],
      updatedAt: daysAgo(100),
    })
    const key = buildCargoPreviewMatchLockKey({
      companyId: graph.companyId,
      contractorId: graph.contractorId,
    })
    let heldResult: Awaited<ReturnType<typeof run>> | undefined
    await db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
      heldResult = await run()
    })

    expect(heldResult?.retained).toBe(0)
    expect(await countEvents(seeded.previewId)).toBe(0)
    expect((await readObjects([seeded.fileObjectId]))[0]?.status).toBe('final')

    await run()

    expect(await countEvents(seeded.previewId)).toBe(1)
  })

  test('o histórico, o vínculo e o item decidido pelo operador não mudam', async () => {
    const seeded = await seedPreview({
      items: [{ decidedByUser: true, state: 'matched', updatedAt: daysAgo(100) }],
      updatedAt: daysAgo(100),
    })
    const eventsBefore = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from cargo_preview_events where preview_id = ${seeded.previewId}`,
    )

    await run()

    const [item] = await readItems(seeded.previewId)
    expect(item?.matched_by).toBe('user')
    expect(item?.matched_by_user_id).toBe(userId)
    expect(item?.match_state).toBe('matched')
    const eventsAfter = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from cargo_preview_events where preview_id = ${seeded.previewId}`,
    )
    expect([...eventsAfter][0]?.count).toBe(([...eventsBefore][0]?.count ?? 0) + 1)
  })
})
