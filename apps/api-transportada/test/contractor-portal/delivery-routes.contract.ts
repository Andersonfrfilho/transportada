/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { ContractorDelivery } from '../../src/contractor-portal/application/contractor-portal.types.js'
import { createContractorDeliveryRoutes } from '../../src/contractor-portal/presentation/contractor-delivery.routes.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const TRACK_PERMISSIONS: CompanyContext['permissions'] = new Set(['deliveries.track'] as const)

const DELIVERY: ContractorDelivery = {
  accessKey: `3526${'1'.repeat(40)}`,
  deliveredAt: null,
  documentId: '00000000-0000-4000-8000-000000000901',
  estimatedArrivalAt: '2026-08-28T13:00:00.000Z',
  issuedAt: '2026-08-27T09:00:00.000Z',
  number: '900001',
  returnReason: null,
  separationStatus: 'loaded',
  series: '1',
  tripStatus: 'dispatched',
}

function createFixture(permissions?: CompanyContext['permissions']) {
  const calls: unknown[] = []

  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(permissions ?? TRACK_PERMISSIONS),
      routes: createContractorDeliveryRoutes({
        listDeliveries: {
          async execute(input) {
            calls.push(structuredClone(input))
            return [DELIVERY]
          },
        },
      }),
    }),
  })

  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

describe('a rota de entregas do contratante (spec 063 T005)', () => {
  /**
   * O payload é lista fechada. Este teste compara **as chaves por extenso** de propósito: campo novo
   * no tipo interno não vaza para o portal sem alguém decidir, por escrito, que ele pode sair.
   */
  test('publica o payload mínimo, e nada além dele', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/client/me/deliveries' }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: readonly Record<string, unknown>[] }
    expect(Object.keys(body.data[0] ?? {}).sort()).toEqual([
      'accessKey',
      'deliveredAt',
      'estimatedArrivalAt',
      'issuedAt',
      'number',
      'returnReason',
      'separationStatus',
      'series',
      'tripStatus',
    ])
  })

  /** Um UUID nosso na mão do cliente é identificador para tentar em outra rota. */
  test('não devolve id interno de nota, de viagem nem de vínculo', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/client/me/deliveries' }),
    )
    const payload = await response.text()

    expect(payload).not.toContain(DELIVERY.documentId)
    expect(payload).not.toContain('documentId')
    expect(payload).not.toContain('tripId')
  })

  /** ADR-0050 §4: a rota não recebe id de nada — o servidor resolve pela conta. */
  test('ignora o que vier na query, e não repassa nada além do contexto', async () => {
    const fixture = createFixture()

    await fixture.handle(
      jsonRequest({
        method: 'GET',
        path: '/client/me/deliveries?taxId=12345678000190&contractorId=x',
      }),
    )

    expect(fixture.calls).toHaveLength(1)
    expect(Object.keys(fixture.calls[0] as Record<string, unknown>)).toEqual(['context'])
  })

  /** Quem trabalha na transportadora não tem `deliveries.track`, e a rota é dela que se defende. */
  test('exige deliveries.track, e invoices.read não basta', async () => {
    const fixture = createFixture(new Set(['invoices.read', 'fleet.read'] as const))

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/client/me/deliveries' }),
    )

    expect(response.status).toBe(403)
    expect(fixture.calls).toEqual([])
  })

  /** A rota é anônima em nada: sem sessão não há conta, e sem conta não há recorte. */
  test('não é rota anônima', async () => {
    const routes = createContractorDeliveryRoutes({
      listDeliveries: {
        async execute() {
          return []
        },
      },
    })

    expect(routes[0]?.policy).toEqual({ permission: 'deliveries.track', scope: 'company' })
  })
})
