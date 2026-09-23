/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Revisão de segurança da spec 164: `cursor` não era validado — `?cursor=abc` chegava cru ao
 * repositório e virava erro de sintaxe do Postgres, respondido como 500 em vez de 400. Este
 * contrato prova o `400` e que um cursor válido segue passando para o caso de uso.
 */
import { describe, expect, test } from 'bun:test'

import type { OccurrenceChargeReportPage } from '../../src/delivery-clients/application/occurrence-charge-report.port'
import { createOccurrenceChargeReportRoutes } from '../../src/delivery-clients/presentation/occurrence-charge-report.routes'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/freight-region-http.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'

const REPORT_PATH = '/occurrence-charges/report'
const VALID_CURSOR = '00000000-0000-4000-8000-000000000901'

const REPORT_PAGE: OccurrenceChargeReportPage = {
  items: [],
  nextCursor: null,
  totals: { byChargeType: [], totalAmount: '0.0000', totalCount: 0 },
}

function createFixture(): {
  readonly filterCalls: unknown[]
  readonly handle: (request: Request) => Promise<Response>
} {
  const filterCalls: unknown[] = []
  const routes = createOccurrenceChargeReportRoutes({
    readReport: {
      async execute(input) {
        filterCalls.push(input.filters)
        return REPORT_PAGE
      },
    },
  })
  const router = createTestRouter({
    context: authenticatedContext(new Set(['trip.financials'])),
    routes,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return { filterCalls, handle: (request) => handleRequest(request, { timeout() {} }) }
}

describe('GET /v1/occurrence-charges/report — cursor (revisão de segurança spec 164)', () => {
  test('cursor que não é uuid é 400, antes de chamar o caso de uso', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${REPORT_PATH}?cursor=abc` }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.filterCalls).toEqual([])
  })

  test('cursor uuid válido chega ao caso de uso nos filtros', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${REPORT_PATH}?cursor=${VALID_CURSOR}` }),
    )

    expect(response.status).toBe(200)
    expect(fixture.filterCalls).toEqual([{ cursor: VALID_CURSOR, limit: 50 }])
  })

  test('sem cursor, segue sem filtro', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: REPORT_PATH }))

    expect(response.status).toBe(200)
    expect(fixture.filterCalls).toEqual([{ limit: 50 }])
  })
})
