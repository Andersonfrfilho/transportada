/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2b (ADR-0094 §9): os itens da nota da chegada contra Postgres — o formulário de avaria
 * lista o que o separador pode marcar sem a nota estar em viagem. Só a nota DA chegada, só da
 * empresa do contexto, na ordem do XML, e só os campos de conferência (nada de NCM nem CFOP).
 */
import { describe, expect, test } from 'bun:test'

import { createListCargoArrivalDocumentProductsUseCase } from '../../src/cargo-receiving/application/read-cargo-arrival-document-products.use-case.js'
import { DrizzleCargoArrivalDocumentProductsRepository } from '../../src/cargo-receiving/infrastructure/drizzle-cargo-arrival-document-products.repository.js'
import { createCargoArrivalDocumentProductsRoute } from '../../src/cargo-receiving/presentation/cargo-arrival-document-products.routes.js'
import { nfeProducts } from '../../src/database/database.schema.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import {
  hasTestDatabase,
  seedIssuedDocument,
  withCargoDatabase,
  type CargoTenants,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  buildPostRequest,
  callCargoArrival as call,
  createCargoArrivalHandler,
} from '../fixtures/cargo-arrival-http.fixture.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const READER: CompanyContext['permissions'] = new Set(['fleet.read'])
const PRODUCT_KEYS = [
  'code',
  'commercialUnit',
  'description',
  'ordinal',
  'quantity',
  'totalValue',
  'unitValue',
]

function createHandler(params: {
  readonly context?: AuthenticatedContext<CompanyContext>
  readonly database: TestDatabase
}): (request: Request) => Promise<Response> {
  const route = createCargoArrivalDocumentProductsRoute({
    listProducts: createListCargoArrivalDocumentProductsUseCase({
      reads: new DrizzleCargoArrivalDocumentProductsRepository(params.database.db),
    }),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 30,
    router: createTestRouter({
      context: params.context ?? authenticatedContext(READER),
      routes: [route],
    }),
  })
  return (request) => handleRequest(request, { timeout() {} })
}

function foreignContext(tenants: CargoTenants): AuthenticatedContext<CompanyContext> {
  const own = authenticatedContext(READER)
  return {
    identity: { ...own.identity, companyIdClaim: tenants.foreignCompanyId },
    scope: {
      ...own.scope,
      companyId: tenants.foreignCompanyId,
      membershipId: tenants.foreignMembershipId,
    },
  }
}

/** Insere fora de ordem de propósito: a ordem da resposta é a do `ordinal`, não a do insert. */
async function seedItems(database: TestDatabase, documentId: string): Promise<void> {
  const item = (ordinal: bigint, code: string, quantity: string) => ({
    cfop: '5102',
    code,
    commercialUnit: 'CX',
    companyId: COMPANY_CONTEXT.companyId,
    description: `Produto ${code}`,
    documentId,
    ncm: '84713012',
    ordinal,
    quantity,
    totalValue: '45.5000',
    unitValue: '4.5500',
  })
  await database.db
    .insert(nfeProducts)
    .values([item(3n, 'P3', '1.0000'), item(1n, 'P1', '10.0000'), item(2n, 'P2', '2.5000')])
}

type Seeded = { readonly arrivalId: string; readonly documentIds: readonly string[] }

/** Chegada de três notas: a primeira com três itens, a segunda sem item, a terceira de outra. */
async function seedArrival(database: TestDatabase, tenants: CargoTenants): Promise<Seeded> {
  const documentIds = [
    await seedIssuedDocument(database, { number: '31' }),
    await seedIssuedDocument(database, { number: '32' }),
  ]
  await seedItems(database, documentIds[0] ?? '')
  const registered = await call(
    createCargoArrivalHandler({ database }),
    buildPostRequest({
      body: {
        arrivedAt: new Date(Date.now() - 3_600_000).toISOString(),
        contractorId: tenants.contractorId,
        documentIds,
      },
      key: `arrival-${crypto.randomUUID()}`,
      path: '/cargo-arrivals',
    }),
  )
  return { arrivalId: String(registered.body.data?.id), documentIds }
}

const productsPath = (arrivalId: string, documentId: string) =>
  `/cargo-arrivals/${arrivalId}/documents/${documentId}/products`

async function errorCode(response: Response): Promise<[number, string | undefined]> {
  const body = (await response.json()) as { error?: { code?: string } }
  return [response.status, body.error?.code]
}

describe('os itens da nota da chegada (spec 237 T3.2b)', () => {
  testWithPostgres('devolve os itens na ordem do XML, só os campos de conferência', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const { arrivalId, documentIds } = await seedArrival(database, tenants)
      const response = await createHandler({ database })(
        jsonRequest({ method: 'GET', path: productsPath(arrivalId, documentIds[0] ?? '') }),
      )
      const body = (await response.json()) as { data: Record<string, unknown>[] }

      expect(response.status).toBe(200)
      expect(Object.keys(body)).toEqual(['data'])
      expect(body.data.map((item) => item.code)).toEqual(['P1', 'P2', 'P3'])
      expect(body.data[0]).toEqual({
        code: 'P1',
        commercialUnit: 'CX',
        description: 'Produto P1',
        ordinal: 1,
        quantity: '10.0000',
        totalValue: '45.5000',
        unitValue: '4.5500',
      })
      for (const item of body.data) expect(Object.keys(item).sort()).toEqual(PRODUCT_KEYS)
    })
  })

  testWithPostgres('nota da chegada sem item é lista vazia, não erro', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const { arrivalId, documentIds } = await seedArrival(database, tenants)
      const response = await createHandler({ database })(
        jsonRequest({ method: 'GET', path: productsPath(arrivalId, documentIds[1] ?? '') }),
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ data: [] })
    })
  })

  testWithPostgres('nota de OUTRA chegada da mesma empresa é 404, sem os itens dela', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const first = await seedArrival(database, tenants)
      const second = await seedArrival(database, tenants)
      const handle = createHandler({ database })

      const crossed = await handle(
        jsonRequest({
          method: 'GET',
          path: productsPath(second.arrivalId, first.documentIds[0] ?? ''),
        }),
      )
      const unknown = await handle(
        jsonRequest({
          method: 'GET',
          path: productsPath(first.arrivalId, crypto.randomUUID()),
        }),
      )

      expect(await errorCode(crossed)).toEqual([404, 'CARGO_ARRIVAL_DOCUMENT_NOT_FOUND'])
      expect(await errorCode(unknown)).toEqual([404, 'CARGO_ARRIVAL_DOCUMENT_NOT_FOUND'])
    })
  })

  testWithPostgres('chegada inexistente ou de outra empresa é 404, sem vazar item', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const { arrivalId, documentIds } = await seedArrival(database, tenants)
      const path = productsPath(arrivalId, documentIds[0] ?? '')

      const foreign = await createHandler({ context: foreignContext(tenants), database })(
        jsonRequest({ method: 'GET', path }),
      )
      const missing = await createHandler({ database })(
        jsonRequest({
          method: 'GET',
          path: productsPath(crypto.randomUUID(), documentIds[0] ?? ''),
        }),
      )

      expect(await errorCode(foreign)).toEqual([404, 'CARGO_ARRIVAL_NOT_FOUND'])
      expect(await errorCode(missing)).toEqual([404, 'CARGO_ARRIVAL_NOT_FOUND'])
    })
  })

  testWithPostgres('só o separador que lê passa: sem fleet.read é 403', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const { arrivalId, documentIds } = await seedArrival(database, tenants)
      const response = await createHandler({
        context: authenticatedContext(new Set(['trip.manage'])),
        database,
      })(jsonRequest({ method: 'GET', path: productsPath(arrivalId, documentIds[0] ?? '') }))

      expect(response.status).toBe(403)
    })
  })
})
