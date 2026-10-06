/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2b (ADR-0094 §9): `GET /cargo-arrivals/:id/documents/:documentId/products` é leitura
 * (`fleet.read`, a permissão do separador) e só aceita os dois ids da URL — nada de query.
 */
import { describe, expect, test } from 'bun:test'

import { createCargoArrivalDocumentProductsRoute } from '../../src/cargo-receiving/presentation/cargo-arrival-document-products.routes.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const ARRIVAL_ID = '00000000-0000-4000-8000-000000000f21'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000f22'
const PATH = `/cargo-arrivals/${ARRIVAL_ID}/documents/${DOCUMENT_ID}/products`
const PRODUCTS = [
  {
    code: 'P1',
    commercialUnit: 'CX',
    description: 'Caixa',
    ordinal: 1,
    quantity: '10.0000',
    totalValue: '100.0000',
    unitValue: '10.0000',
  },
]

const READER: CompanyContext['permissions'] = new Set(['fleet.read'])
const WITHOUT_READ: CompanyContext['permissions'] = new Set(['trip.read', 'trip.manage'])

function createFixture(permissions: CompanyContext['permissions']) {
  const calls: unknown[] = []
  const routes = [
    createCargoArrivalDocumentProductsRoute({
      listProducts: {
        async execute(params) {
          calls.push(params)
          return PRODUCTS
        },
      },
    }),
  ]
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({ context: authenticatedContext(permissions), routes }),
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

describe('os itens da nota da chegada por HTTP (spec 237 T3.2b)', () => {
  test('200 no envelope { data }, com a empresa do contexto e os dois ids da URL', async () => {
    const fixture = createFixture(READER)
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: PRODUCTS })
    expect(fixture.calls).toEqual([
      {
        arrivalId: ARRIVAL_ID,
        context: { ...COMPANY_CONTEXT, permissions: READER },
        documentId: DOCUMENT_ID,
      },
    ])
  })

  test('sem fleet.read é 403, mesmo com trip.read e trip.manage', async () => {
    const fixture = createFixture(WITHOUT_READ)
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))

    expect(response.status).toBe(403)
    expect(fixture.calls).toEqual([])
  })

  test('id que não é UUID nem chega à rota: o roteador responde 404 NOT_FOUND', async () => {
    const fixture = createFixture(READER)
    for (const path of [
      `/cargo-arrivals/nao-e-uuid/documents/${DOCUMENT_ID}/products`,
      `/cargo-arrivals/${ARRIVAL_ID}/documents/nao-e-uuid/products`,
    ]) {
      const response = await fixture.handle(jsonRequest({ method: 'GET', path }))

      expect(response.status).toBe(404)
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND')
    }
    expect(fixture.calls).toEqual([])
  })

  test('query desconhecida é 400 INVALID_REQUEST, sem chamar o caso de uso', async () => {
    const fixture = createFixture(READER)
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${PATH}?companyId=outra` }),
    )

    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'INVALID_REQUEST',
    )
    expect(fixture.calls).toEqual([])
  })
})
