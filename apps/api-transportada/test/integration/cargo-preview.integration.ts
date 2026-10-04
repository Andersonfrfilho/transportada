/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2 contra Postgres: o envio grava prévia, evento e pedido ao worker na mesma transação,
 * repete sem duplicar, isola a empresa; o operador confirma, desvincula e vincula com trilha; uma
 * nota nunca está em duas prévias; e a prévia propõe a chegada sem criar nada.
 */
import { describe, expect, test } from 'bun:test'
import { and, eq, sql } from 'drizzle-orm'

import { createCargoPreviewHttpRoutes } from '../../src/cargo-receiving/cargo-preview.composition.js'
import {
  cargoArrivals,
  cargoPreviewDocumentLinks,
  cargoPreviewEvents,
  cargoPreviewItems,
  cargoPreviewOutbox,
  cargoPreviews,
} from '../../src/database/database.schema.js'
import { findPostgresError } from '../../src/database/postgres-error.support.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  hasTestDatabase,
  OTHER_ISSUER_TAX_ID,
  seedIssuedDocument,
  seedLiveTrip,
  withCargoDatabase,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  createPreviewStorage,
  enablePreviewProfile,
  seedPreviewItem,
  seedReadyPreview,
} from '../fixtures/cargo-preview-database.fixture.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const SEPARATOR: CompanyContext['permissions'] = new Set(['fleet.read', 'trip.manage'])
const WORKBOOK = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('previa-1')])
const OTHER_WORKBOOK = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 7, 7, 7])

type Body = { readonly data?: Record<string, unknown>; readonly error?: Record<string, unknown> }

function createHandler(database: TestDatabase) {
  const storage = createPreviewStorage()
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 30,
    router: createTestRouter({
      context: authenticatedContext(SEPARATOR),
      routes: createCargoPreviewHttpRoutes({ bucket: 'private', database: database.db, storage }),
    }),
  })
  const call = async (request: Request): Promise<{ body: Body; status: number }> => {
    const response = await handleRequest(request, { timeout() {} })
    return { body: (await response.json()) as Body, status: response.status }
  }
  return { call, storage }
}

function upload(input: { bytes?: Uint8Array; contractorId: string; key: string }): Request {
  const form = new FormData()
  form.append('contractorId', input.contractorId)
  form.append('file', new File([input.bytes ?? WORKBOOK], 'FR-28-09.xlsm'))
  return new Request(`${FRONTEND_ORIGIN}/cargo-previews`, {
    body: form,
    headers: { 'idempotency-key': input.key, origin: FRONTEND_ORIGIN },
    method: 'POST',
  })
}

const post = (path: string, body?: unknown) => jsonRequest({ body, method: 'POST', path })
const get = (path: string) => jsonRequest({ method: 'GET', path })

async function countRows(database: TestDatabase) {
  const [previews, events, outbox] = await Promise.all([
    database.db.select().from(cargoPreviews),
    database.db.select().from(cargoPreviewEvents),
    database.db.select().from(cargoPreviewOutbox),
  ])
  return { events: events.length, outbox: outbox.length, previews: previews.length }
}

describe('o envio da prévia contra Postgres (spec 237 T4.2)', () => {
  testWithPostgres(
    'grava prévia, evento e pedido ao worker juntos, e repete sem duplicar',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const { call, storage } = createHandler(database)

        const disabled = await call(upload({ ...tenants, key: 'preview-key-00000001' }))
        expect(disabled.status).toBe(422)
        expect(disabled.body.error?.code).toBe('CARGO_PREVIEW_NOT_ENABLED')
        // O mapa sozinho não liga a prévia: o interruptor do perfil é quem decide.
        await enablePreviewProfile(database, tenants.contractorId)
        await database.db.execute(
          sql`update contractor_receiving_profiles set preview_enabled = false`,
        )
        const mapOnly = await call(upload({ ...tenants, key: 'preview-key-00000001' }))
        expect(mapOnly.body.error?.code).toBe('CARGO_PREVIEW_NOT_ENABLED')
        expect(storage.objects.size).toBe(0)

        await enablePreviewProfile(database, tenants.contractorId)
        const created = await call(upload({ ...tenants, key: 'preview-key-00000001' }))
        expect(created.status).toBe(201)
        expect(created.body.data).toMatchObject({
          source: 'upload',
          status: 'queued',
          rowCount: null,
        })
        const previewId = String(created.body.data?.id)
        const [outbox] = await database.db.select().from(cargoPreviewOutbox)
        expect(outbox).toMatchObject({ eventType: 'cargo-preview.process', previewId })
        const objectKey = (outbox?.payload as { objectKey: string }).objectKey
        expect(objectKey).toMatch(/^tenants\/[0-9a-f-]+\/cargo-previews\/[0-9a-f-]+$/u)
        expect([...storage.objects.keys()]).toEqual([`private/${objectKey}`])
        expect(await countRows(database)).toEqual({ events: 1, outbox: 1, previews: 1 })

        const sameFile = await call(upload({ ...tenants, key: 'preview-key-00000002' }))
        expect(sameFile.status).toBe(200)
        expect(sameFile.body.data?.id).toBe(previewId)
        expect(storage.objects.size).toBe(1)

        const reused = await call(
          upload({ ...tenants, bytes: OTHER_WORKBOOK, key: 'preview-key-00000001' }),
        )
        expect(reused.status).toBe(409)
        expect(await countRows(database)).toEqual({ events: 1, outbox: 1, previews: 1 })

        const foreign = await call(
          upload({ contractorId: tenants.foreignContractorId, key: 'preview-key-00000003' }),
        )
        expect(foreign.status).toBe(404)
        expect(foreign.body.error?.code).toBe('CONTRACTOR_NOT_FOUND')
      })
    },
  )

  testWithPostgres('outbox que falha desfaz a prévia e tira o objeto do bucket', async () => {
    await withCargoDatabase(async (database, tenants) => {
      await enablePreviewProfile(database, tenants.contractorId)
      const { call, storage } = createHandler(database)
      await database.db.execute(sql`
        create function fail_preview_outbox() returns trigger language plpgsql as $$
        begin raise exception 'outbox down'; end; $$`)
      await database.db.execute(sql`
        create trigger fail_preview_outbox before insert on cargo_preview_outbox
        for each row execute function fail_preview_outbox()`)

      const response = await call(upload({ ...tenants, key: 'preview-key-00000009' }))
      expect(response.status).toBe(500)
      expect(await countRows(database)).toEqual({ events: 0, outbox: 0, previews: 0 })
      expect(storage.objects.size).toBe(0)
    })
  })
})

describe('ler e decidir a prévia contra Postgres (spec 237 T4.2)', () => {
  testWithPostgres(
    'outra empresa é 404; lista e detalhe trazem contagens, roteiros e a nota',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const { call } = createHandler(database)
        const documentId = await seedIssuedDocument(database, { number: '71' })
        const previewId = await seedReadyPreview(database, { ...tenants, label: 'leitura' })
        await seedPreviewItem(database, { documentId, previewId, rowNumber: 5, state: 'matched' })
        await seedPreviewItem(database, { previewId, rowNumber: 6, state: 'awaiting_xml' })
        const foreignPreview = await seedReadyPreview(database, {
          companyId: tenants.foreignCompanyId,
          contractorId: tenants.foreignContractorId,
          label: 'alheia',
        })

        expect((await call(get(`/cargo-previews/${foreignPreview}`))).status).toBe(404)
        const list = await call(get('/cargo-previews'))
        expect((list.body.data as unknown as { id: string }[]).map((row) => row.id)).toEqual([
          previewId,
        ])

        const detail = await call(get(`/cargo-previews/${previewId}?limit=1`))
        expect(detail.body.data).toMatchObject({
          counts: { awaiting_xml: 1, matched: 1, total: 2 },
          routes: [{ routeName: 'FR.S.CAR' }],
        })
        const items = detail.body.data?.items as {
          items: { document: { number: string } | null }[]
          nextCursor: string
        }
        expect(items.items[0]?.document?.number).toBe('71')
        expect(items.nextCursor).toBe('5')
      })
    },
  )

  testWithPostgres(
    'confirmar, desvincular e vincular gravam a trilha e respeitam o 1:1',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const { call } = createHandler(database)
        const [suggestedDoc, groupDoc, elsewhereDoc] = [
          await seedIssuedDocument(database, { number: '81' }),
          await seedIssuedDocument(database, { number: '82' }),
          await seedIssuedDocument(database, { number: '83' }),
        ]
        const foreignIssuerDoc = await seedIssuedDocument(database, {
          emitterTaxId: OTHER_ISSUER_TAX_ID,
          number: '84',
        })
        const previewId = await seedReadyPreview(database, { ...tenants, label: 'acoes' })
        const otherPreview = await seedReadyPreview(database, { ...tenants, label: 'outra' })
        await seedPreviewItem(database, {
          documentId: elsewhereDoc,
          previewId: otherPreview,
          rowNumber: 5,
          state: 'matched',
        })
        const suggested = await seedPreviewItem(database, {
          previewId,
          rowNumber: 5,
          state: 'suggested',
          suggestedDocumentId: suggestedDoc,
        })
        const groupA = await seedPreviewItem(database, {
          documentId: groupDoc,
          previewId,
          rowNumber: 6,
          state: 'matched',
        })
        const groupB = await seedPreviewItem(database, {
          documentId: groupDoc,
          previewId,
          rowNumber: 7,
          state: 'matched',
        })
        const waiting = await seedPreviewItem(database, {
          previewId,
          rowNumber: 8,
          state: 'awaiting_xml',
        })
        const base = `/cargo-previews/${previewId}/items`

        const confirmed = await call(post(`${base}/${suggested}/confirm`))
        expect(confirmed.body.data).toEqual({ itemIds: [suggested], outcome: 'changed' })
        expect((await call(post(`${base}/${suggested}/confirm`))).body.data?.outcome).toBe(
          'unchanged',
        )

        const unlinked = await call(post(`${base}/${groupA}/unlink`))
        expect(unlinked.body.data).toEqual({ itemIds: [groupA, groupB], outcome: 'changed' })

        const elsewhere = await call(post(`${base}/${waiting}/link`, { documentId: elsewhereDoc }))
        expect(elsewhere.status).toBe(422)
        expect(elsewhere.body.error?.code).toBe('CARGO_PREVIEW_DOCUMENT_ALREADY_LINKED')
        const foreign = await call(
          post(`${base}/${waiting}/link`, { documentId: foreignIssuerDoc }),
        )
        expect(foreign.body.error?.code).toBe('CARGO_PREVIEW_DOCUMENT_NOT_CANDIDATE')
        const linked = await call(post(`${base}/${waiting}/link`, { documentId: groupDoc }))
        expect(linked.status).toBe(200)

        const items = await database.db
          .select()
          .from(cargoPreviewItems)
          .where(eq(cargoPreviewItems.previewId, previewId))
          .orderBy(cargoPreviewItems.rowNumber)
        expect(
          items.map((item) => [item.matchState, item.matchedBy, item.matchedDocumentId]),
        ).toEqual([
          ['matched', 'user', suggestedDoc],
          ['awaiting_xml', 'user', null],
          ['awaiting_xml', 'user', null],
          ['matched', 'user', groupDoc],
        ])
        const events = await database.db
          .select({ kind: cargoPreviewEvents.kind })
          .from(cargoPreviewEvents)
          .where(eq(cargoPreviewEvents.previewId, previewId))
        expect(events.map((event): string => event.kind).sort()).toEqual(
          ['item_confirmed', 'item_linked_manually', 'item_unlinked', 'item_unlinked'].sort(),
        )

        // A garantia é do banco, não só da rota: a mesma nota em outra prévia é unique violada.
        const duplicate = await database.db
          .insert(cargoPreviewDocumentLinks)
          .values({
            companyId: items[0]?.companyId ?? '',
            documentId: suggestedDoc,
            linkedBy: 'system',
            previewId: otherPreview,
          })
          .catch((error: unknown) => findPostgresError({ error })?.constraint)
        expect(duplicate).toBe('cargo_preview_document_links_company_document_unique')
      })
    },
  )

  testWithPostgres(
    'dois operadores ligando a mesma nota a prévias diferentes: um só vence',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const { call } = createHandler(database)
        const documentId = await seedIssuedDocument(database, { number: '91' })
        const [first, second] = [
          await seedReadyPreview(database, { ...tenants, label: 'p1' }),
          await seedReadyPreview(database, { ...tenants, label: 'p2' }),
        ]
        const itemOf = async (previewId: string) =>
          seedPreviewItem(database, { previewId, rowNumber: 5, state: 'awaiting_xml' })
        const [itemA, itemB] = [await itemOf(first), await itemOf(second)]

        const results = await Promise.all([
          call(post(`/cargo-previews/${first}/items/${itemA}/link`, { documentId })),
          call(post(`/cargo-previews/${second}/items/${itemB}/link`, { documentId })),
        ])
        expect(results.map((result) => result.status).sort()).toEqual([200, 422])
        const links = await database.db
          .select()
          .from(cargoPreviewDocumentLinks)
          .where(eq(cargoPreviewDocumentLinks.documentId, documentId))
        expect(links).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'propor a chegada devolve as notas que podem entrar hoje e não cria nada',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const { call } = createHandler(database)
        const [free, inTrip] = [
          await seedIssuedDocument(database, { number: '95' }),
          await seedIssuedDocument(database, { number: '96' }),
        ]
        await seedLiveTrip(database, inTrip)
        const previewId = await seedReadyPreview(database, { ...tenants, label: 'proposta' })
        await seedPreviewItem(database, {
          documentId: free,
          previewId,
          rowNumber: 5,
          state: 'matched',
        })
        await seedPreviewItem(database, {
          documentId: free,
          previewId,
          rowNumber: 6,
          state: 'matched',
        })
        await seedPreviewItem(database, {
          documentId: inTrip,
          previewId,
          rowNumber: 7,
          state: 'matched',
        })
        await seedPreviewItem(database, { previewId, rowNumber: 8, state: 'awaiting_xml' })

        const proposal = await call(post(`/cargo-previews/${previewId}/propose-arrival`))
        expect(proposal.status).toBe(200)
        expect(proposal.body.data).toEqual({
          contractorId: tenants.contractorId,
          documentIds: [free],
          plannedDate: '2026-10-05',
          previewId,
          refused: [{ documentId: inTrip, reason: 'DOCUMENT_IN_LIVE_TRIP' }],
        })
        expect(await database.db.select().from(cargoArrivals)).toEqual([])
        const proposed = await database.db
          .select()
          .from(cargoPreviewEvents)
          .where(
            and(
              eq(cargoPreviewEvents.previewId, previewId),
              eq(cargoPreviewEvents.kind, 'arrival_proposed'),
            ),
          )
        expect(proposed).toHaveLength(1)
      })
    },
  )
})
