/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237, revisão de segurança da Fase 4a (S5), contra Postgres: cada prévia nova é uma leitura de
 * planilha no worker, e a fila do contratante não cresce sem fim. Com 5 prévias na fila ou em
 * leitura, a sexta (nova ou reaberta) é 422 `CARGO_PREVIEW_TOO_MANY_OPEN`, sem objeto no bucket e
 * sem linha; repetir um arquivo que já está lá continua 200.
 */
import { describe, expect, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'

import { createCargoPreviewHttpRoutes } from '../../src/cargo-receiving/cargo-preview.composition.js'
import { cargoPreviews } from '../../src/database/database.schema.js'
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

type Body = { readonly data?: Record<string, unknown>; readonly error?: Record<string, unknown> }

function workbook(seed: number): Uint8Array {
  return new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode(`previa-${seed}`)])
}

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
  const upload = async (input: { contractorId: string; seed: number }) => {
    const form = new FormData()
    form.append('contractorId', input.contractorId)
    form.append('file', new File([workbook(input.seed)], 'FR.xlsm'))
    const request = new Request(`${FRONTEND_ORIGIN}/cargo-previews`, {
      body: form,
      headers: {
        'idempotency-key': `limit-key-${String(input.seed).padStart(8, '0')}`,
        origin: FRONTEND_ORIGIN,
      },
      method: 'POST',
    })
    const response = await handleRequest(request, { timeout() {} })
    return { body: (await response.json()) as Body, status: response.status }
  }
  return { storage, upload }
}

describe('o teto de prévias na fila por contratante (spec 237, segurança S5)', () => {
  testWithPostgres(
    'a sexta prévia em aberto é recusada; a repetida e a que terminou não contam',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        await enablePreviewProfile(database, tenants.contractorId)
        const { storage, upload } = createHandler(database)
        const created: string[] = []
        for (const seed of [1, 2, 3, 4, 5]) {
          const result = await upload({ contractorId: tenants.contractorId, seed })
          expect(result.status).toBe(201)
          created.push(String(result.body.data?.id))
        }

        const sixth = await upload({ contractorId: tenants.contractorId, seed: 6 })
        expect(sixth.status).toBe(422)
        expect(sixth.body.error?.code).toBe('CARGO_PREVIEW_TOO_MANY_OPEN')
        expect(storage.objects.size).toBe(5)
        expect(await database.db.select().from(cargoPreviews)).toHaveLength(5)

        const replay = await upload({ contractorId: tenants.contractorId, seed: 1 })
        expect(replay.status).toBe(200)

        await database.db
          .update(cargoPreviews)
          .set({ errorCode: 'PREVIEW_NOT_A_WORKBOOK', status: 'failed' })
          .where(eq(cargoPreviews.id, created[0] ?? ''))
        expect((await upload({ contractorId: tenants.contractorId, seed: 6 })).status).toBe(201)
      })
    },
  )

  testWithPostgres('reabrir uma prévia que falhou também respeita o teto', async () => {
    await withCargoDatabase(async (database, tenants) => {
      await enablePreviewProfile(database, tenants.contractorId)
      const { upload } = createHandler(database)
      const failed = await upload({ contractorId: tenants.contractorId, seed: 10 })
      await database.db.execute(
        sql`update cargo_previews set status = 'failed', error_code = 'PREVIEW_NOT_A_WORKBOOK' where id = ${String(failed.body.data?.id)}`,
      )
      for (const seed of [11, 12, 13, 14, 15]) {
        expect((await upload({ contractorId: tenants.contractorId, seed })).status).toBe(201)
      }

      const reopened = await upload({ contractorId: tenants.contractorId, seed: 10 })
      expect(reopened.status).toBe(422)
      expect(reopened.body.error?.code).toBe('CARGO_PREVIEW_TOO_MANY_OPEN')
      const [row] = await database.db
        .select({ status: cargoPreviews.status })
        .from(cargoPreviews)
        .where(eq(cargoPreviews.id, String(failed.body.data?.id)))
      expect(row?.status).toBe('failed')
    })
  })
})
