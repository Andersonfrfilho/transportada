/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a contra Postgres (correção da revisão da Fase 4a, M2, L5 e L6): desvincular revoga o
 * alias `Company → CNPJ` que esta prévia aprendeu daquele vínculo — e só ele — e pede a reavaliação
 * do contratante, porque a nota solta pode servir a outra prévia. E propor a chegada é idempotente
 * na trilha: o evento só se repete quando o conjunto de notas muda.
 */
import { describe, expect, test } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { createCargoPreviewHttpRoutes } from '../../src/cargo-receiving/cargo-preview.composition.js'
import {
  cargoPreviewEvents,
  cargoPreviewOutbox,
  contractorRecipientAliases,
} from '../../src/database/database.schema.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  hasTestDatabase,
  seedIssuedDocument,
  withCargoDatabase,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  createPreviewStorage,
  seedPreviewItem,
  seedReadyPreview,
} from '../fixtures/cargo-preview-database.fixture.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const SEPARATOR: CompanyContext['permissions'] = new Set(['fleet.read', 'trip.manage'])

function createCall(database: TestDatabase) {
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 30,
    router: createTestRouter({
      context: authenticatedContext(SEPARATOR),
      routes: createCargoPreviewHttpRoutes({
        bucket: 'private',
        database: database.db,
        storage: createPreviewStorage(),
      }),
    }),
  })
  return async (path: string) => {
    const response = await handleRequest(jsonRequest({ method: 'POST', path }), { timeout() {} })
    return response.status
  }
}

describe('desvincular revoga o alias e pede a reavaliação (spec 237 M2/L5)', () => {
  testWithPostgres(
    'o alias aprendido do vínculo desfeito sai; o que outro item sustenta fica',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const call = createCall(database)
        const previewId = await seedReadyPreview(database, { ...tenants, label: 'alias' })
        const seed = async (number: string, recipientTaxId: string) =>
          seedIssuedDocument(database, { number, recipientTaxId })
        const [wrong, kept, twinA, twinB] = [
          await seed('91', '11111111000101'),
          await seed('92', '22222222000102'),
          await seed('93', '33333333000103'),
          await seed('94', '33333333000103'),
        ]
        const item = (input: { code: string; documentId: string; rowNumber: number }) =>
          seedPreviewItem(database, {
            documentId: input.documentId,
            previewId,
            recipientCode: input.code,
            rowNumber: input.rowNumber,
            state: 'matched',
          })
        const wrongItem = await item({ code: '10001', documentId: wrong, rowNumber: 5 })
        await item({ code: '10001', documentId: wrong, rowNumber: 6 })
        await item({ code: '10002', documentId: kept, rowNumber: 7 })
        const twinItem = await item({ code: '10003', documentId: twinA, rowNumber: 8 })
        await item({ code: '10003', documentId: twinB, rowNumber: 9 })
        await database.db.insert(contractorRecipientAliases).values(
          [
            ['10001', '11111111000101'],
            ['10002', '22222222000102'],
            ['10003', '33333333000103'],
          ].map(([recipientCode, recipientTaxId]) => ({
            companyId: COMPANY_CONTEXT.companyId,
            contractorId: tenants.contractorId,
            learnedFromPreviewId: previewId,
            recipientCode: recipientCode ?? '',
            recipientTaxId: recipientTaxId ?? '',
          })),
        )
        const base = `/cargo-previews/${previewId}/items`

        expect(await call(`${base}/${wrongItem}/unlink`)).toBe(200)
        expect(await call(`${base}/${twinItem}/unlink`)).toBe(200)

        const aliases = await database.db
          .select({ code: contractorRecipientAliases.recipientCode })
          .from(contractorRecipientAliases)
          .where(eq(contractorRecipientAliases.contractorId, tenants.contractorId))
        expect(aliases.map((alias) => alias.code).sort()).toEqual(['10002', '10003'])

        const requests = await database.db
          .select({ payload: cargoPreviewOutbox.payload, previewId: cargoPreviewOutbox.previewId })
          .from(cargoPreviewOutbox)
          .where(
            and(
              eq(cargoPreviewOutbox.contractorId, tenants.contractorId),
              eq(cargoPreviewOutbox.eventType, 'cargo-preview.reevaluate'),
            ),
          )
        expect(requests).toEqual([
          { payload: { contractorId: tenants.contractorId }, previewId: null },
          { payload: { contractorId: tenants.contractorId }, previewId: null },
        ])
      })
    },
  )

  testWithPostgres(
    'propor a chegada de novo com as mesmas notas não repete o evento; outro conjunto grava (L6)',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const call = createCall(database)
        const previewId = await seedReadyPreview(database, { ...tenants, label: 'proposta' })
        const [first, second] = [
          await seedIssuedDocument(database, { number: '95' }),
          await seedIssuedDocument(database, { number: '96' }),
        ]
        await seedPreviewItem(database, {
          documentId: first,
          previewId,
          rowNumber: 5,
          state: 'matched',
        })
        const secondItem = await seedPreviewItem(database, {
          documentId: second,
          previewId,
          rowNumber: 6,
          state: 'matched',
        })
        const proposals = async () =>
          (
            await database.db
              .select({ id: cargoPreviewEvents.id })
              .from(cargoPreviewEvents)
              .where(
                and(
                  eq(cargoPreviewEvents.previewId, previewId),
                  eq(cargoPreviewEvents.kind, 'arrival_proposed'),
                ),
              )
          ).length

        expect(await call(`/cargo-previews/${previewId}/propose-arrival`)).toBe(200)
        expect(await call(`/cargo-previews/${previewId}/propose-arrival`)).toBe(200)
        expect(await proposals()).toBe(1)

        await call(`/cargo-previews/${previewId}/items/${secondItem}/unlink`)
        expect(await call(`/cargo-previews/${previewId}/propose-arrival`)).toBe(200)
        expect(await proposals()).toBe(2)
      })
    },
  )
})
