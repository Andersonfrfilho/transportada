/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2 contra Postgres (correção da revisão da Fase 4a, M1): a prévia que falhou (perfil
 * com coluna mal mapeada) volta à fila quando o operador corrige o perfil e reenvia o MESMO
 * arquivo — mesma prévia, pedido novo ao worker e evento na trilha. Pronta, ou em leitura recente,
 * continua repetição (200) sem pedido novo.
 */
import { describe, expect, test } from 'bun:test'
import { and, asc, eq, sql } from 'drizzle-orm'

import { createCargoPreviewHttpRoutes } from '../../src/cargo-receiving/cargo-preview.composition.js'
import {
  cargoPreviewEvents,
  cargoPreviewOutbox,
  cargoPreviews,
} from '../../src/database/database.schema.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  hasTestDatabase,
  withCargoDatabase,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  createPreviewStorage,
  enablePreviewProfile,
} from '../fixtures/cargo-preview-database.fixture.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
} from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const SEPARATOR: CompanyContext['permissions'] = new Set(['fleet.read', 'trip.manage'])
const WORKBOOK = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('reenvio')])

function createUpload(database: TestDatabase) {
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
  let sequence = 0
  const upload = async (contractorId: string) => {
    const form = new FormData()
    form.append('contractorId', contractorId)
    form.append('file', new File([WORKBOOK], 'FR-28-09.xlsm'))
    sequence += 1
    const response = await handleRequest(
      new Request(`${FRONTEND_ORIGIN}/cargo-previews`, {
        body: form,
        headers: { 'idempotency-key': `preview-resend-key-${sequence}`, origin: FRONTEND_ORIGIN },
        method: 'POST',
      }),
      { timeout() {} },
    )
    const body = (await response.json()) as { data?: { id?: string; status?: string } }
    return { id: body.data?.id ?? '', status: response.status, previewStatus: body.data?.status }
  }
  return { storage, upload }
}

describe('reenviar o mesmo arquivo da prévia (spec 237 M1)', () => {
  testWithPostgres(
    'falhou → corrige o perfil → reenvia: reabre; pronta ou em leitura recente: repetição',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        await enablePreviewProfile(database, tenants.contractorId)
        const { storage, upload } = createUpload(database)
        const created = await upload(tenants.contractorId)
        expect(created.status).toBe(201)
        const previewId = created.id
        const setPreview = (fragment: ReturnType<typeof sql>) =>
          database.db.execute(sql`update cargo_previews set ${fragment} where id = ${previewId}`)
        const processRequests = async () =>
          (
            await database.db
              .select({ id: cargoPreviewOutbox.id })
              .from(cargoPreviewOutbox)
              .where(
                and(
                  eq(cargoPreviewOutbox.previewId, previewId),
                  eq(cargoPreviewOutbox.eventType, 'cargo-preview.process'),
                ),
              )
          ).length

        await setPreview(sql`status = 'failed', error_code = 'PREVIEW_COLUMN_NOT_FOUND'`)
        const reopened = await upload(tenants.contractorId)
        expect([reopened.status, reopened.id, reopened.previewStatus]).toEqual([
          201,
          previewId,
          'queued',
        ])
        const [row] = await database.db
          .select({ errorCode: cargoPreviews.errorCode, status: cargoPreviews.status })
          .from(cargoPreviews)
          .where(eq(cargoPreviews.id, previewId))
        expect(row).toEqual({ errorCode: null, status: 'queued' })
        expect(await processRequests()).toBe(2)
        expect(storage.objects.size).toBe(1)
        const events = await database.db
          .select({ details: cargoPreviewEvents.details, kind: cargoPreviewEvents.kind })
          .from(cargoPreviewEvents)
          .where(eq(cargoPreviewEvents.previewId, previewId))
          .orderBy(asc(cargoPreviewEvents.recordedAt))
        expect(events.map((event) => [event.kind, event.details?.['reopened'] ?? false])).toEqual([
          ['uploaded', false],
          ['uploaded', true],
        ])

        expect((await upload(tenants.contractorId)).status).toBe(200)
        await setPreview(sql`status = 'ready', row_count = 0`)
        expect((await upload(tenants.contractorId)).status).toBe(200)
        await setPreview(sql`status = 'processing', row_count = null, updated_at = now()`)
        expect((await upload(tenants.contractorId)).status).toBe(200)
        expect(await processRequests()).toBe(2)

        await setPreview(sql`updated_at = now() - interval '1 hour'`)
        expect((await upload(tenants.contractorId)).status).toBe(201)
        expect(await processRequests()).toBe(3)
      })
    },
  )
})
