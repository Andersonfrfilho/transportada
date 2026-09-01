/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { ExtraChargeBatchReport } from '../../src/delivery-clients/application/extra-charge-batch.port.js'
import { createContractorExtraChargeRoutes } from '../../src/contractor-portal/presentation/contractor-extra-charge.routes.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const BATCH_ID = '00000000-0000-4000-8000-000000000910'
const CHARGE_ID = '00000000-0000-4000-8000-000000000911'

const CONTRACTOR_PERMISSIONS: CompanyContext['permissions'] = new Set([
  'deliveries.track',
  'charges.decide',
] as const)

const REPORT: ExtraChargeBatchReport = {
  batch: {
    closedAt: '2026-08-31T12:00:00.000Z',
    contractorId: '00000000-0000-4000-8000-000000000912',
    id: BATCH_ID,
    periodEnd: '2026-08-31',
    periodStart: '2026-08-01',
    status: 'closed',
    totalAmount: '135.0500',
  },
  contractorName: 'Spani Atacadista',
  items: [
    {
      amount: '45.3000',
      chargedOn: '2026-08-10',
      chargeType: 'unloading',
      clientName: 'Loja Central',
      clientTaxId: '98765432000109',
      id: CHARGE_ID,
      notes: '',
      rejectionReason: '',
      status: 'submitted',
    },
  ],
  itemsTotal: '45.3000',
}

function createFixture(permissions?: CompanyContext['permissions']) {
  const calls: Record<string, unknown[]> = { decide: [], list: [] }

  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(permissions ?? CONTRACTOR_PERMISSIONS),
      routes: createContractorExtraChargeRoutes({
        decideBatch: {
          async execute(input) {
            calls.decide?.push(structuredClone(input))
            return REPORT
          },
        },
        listBatches: {
          async execute(input) {
            calls.list?.push(structuredClone(input))
            return [REPORT]
          },
        },
      }),
    }),
  })

  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

describe('o repasse no portal do contratante (spec 063 T007)', () => {
  test('lista os lotes da conta, sem receber id de contratante', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/client/me/extra-charge-batches?contractorId=x' }),
    )

    expect(response.status).toBe(200)
    expect(Object.keys(fixture.calls.list?.[0] as Record<string, unknown>)).toEqual(['context'])
  })

  /** O contratante confere cobrança; ele não navega na nossa base nem lê o documento do cliente. */
  test('o relatório não leva documento do cliente nem id de viagem', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/client/me/extra-charge-batches' }),
    )
    const payload = await response.text()

    expect(payload).not.toContain('98765432000109')
    expect(payload).not.toContain('clientTaxId')
    expect(payload).not.toContain('tripId')
    expect(payload).toContain('Loja Central')
  })

  test('decide linha a linha, pelo id do lançamento', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {
          decisions: [{ chargeId: CHARGE_ID, decision: 'rejected', reason: 'Não houve descarga' }],
        },
        method: 'POST',
        path: `/client/me/extra-charge-batches/${BATCH_ID}/decisions`,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.calls.decide).toHaveLength(1)
    expect((fixture.calls.decide?.[0] as { batchId: string }).batchId).toBe(BATCH_ID)
  })

  /**
   * Aprovar cobrança é decisão de dinheiro: quem só acompanha entrega não decide repasse por
   * consequência de conseguir ver a entrega.
   */
  test('decidir exige charges.decide, e deliveries.track sozinha não basta', async () => {
    const fixture = createFixture(new Set(['deliveries.track'] as const))

    const decide = await fixture.handle(
      jsonRequest({
        body: { decisions: [{ chargeId: CHARGE_ID, decision: 'approved', reason: '' }] },
        method: 'POST',
        path: `/client/me/extra-charge-batches/${BATCH_ID}/decisions`,
      }),
    )
    expect(decide.status).toBe(403)
    expect(fixture.calls.decide).toEqual([])

    const list = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/client/me/extra-charge-batches' }),
    )
    expect(list.status).toBe(200)
  })
})
