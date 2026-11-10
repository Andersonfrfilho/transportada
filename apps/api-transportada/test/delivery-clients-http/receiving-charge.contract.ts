/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (T6): os Ressarcimentos mostram as fotos da cobrança no recebimento com link assinado, e o escritório lê e
 * limpa a marca "cobra no recebimento" do cliente. Ler é `fleet.read`, limpar é `fleet.manage`; cliente de outra
 * empresa é 404.
 */
import { describe, expect, test } from 'bun:test'

import type { DeliveryClientReceivingChargeFlag } from '../../src/delivery-clients/application/delivery-client-receiving-charge-flag.port'
import type { OccurrenceChargeReportRecord } from '../../src/delivery-clients/application/occurrence-charge-report.port'
import { createOccurrenceChargeReportUseCase } from '../../src/delivery-clients/application/occurrence-charge-report.use-case'
import { createDeliveryClientReceivingChargeFlagRoutes } from '../../src/delivery-clients/presentation/delivery-client-receiving-charge-flag.routes'
import { createRequestHandler } from '../../src/http/request-handler.service'
import type { CompanyPermission } from '../../src/identity/domain/authorization.policy.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/freight-region-http.fixture'

const CLIENT_ID = '00000000-0000-4000-8000-0000000000b1'
const OTHER_COMPANY_CLIENT_ID = '00000000-0000-4000-8000-0000000000b9'
const STOP_OCCURRENCE_ID = '00000000-0000-4000-8000-0000000000c5'
const FLAG_PATH = `/delivery-clients/${CLIENT_ID}/receiving-charge-flag`

describe('Ressarcimentos: a cobrança no recebimento com as fotos (spec 317 T6)', () => {
  const record: OccurrenceChargeReportRecord = {
    accessKey: null,
    amount: '45.9000',
    chargeType: 'receiving_charge',
    chargedOn: '2026-11-10',
    contractorId: null,
    hasSettlement: false,
    id: '00000000-0000-4000-8000-0000000000d9',
    noteNumber: '123',
    noteSeries: '1',
    occurrenceId: null,
    photos: [
      {
        bucket: 'privado',
        label: 'Foto da placa',
        objectKey: 'tenants/x/placa',
        slotKey: 'charge_sign',
      },
      {
        bucket: 'privado',
        label: 'Comprovante',
        objectKey: 'tenants/x/recibo',
        slotKey: 'payment_receipt',
      },
    ],
    receivingCharge: {
      driverPayoutSentAt: null,
      driverPixKey: '12345678909',
      driverPixKeyType: 'cpf',
      paidBy: 'driver',
    },
    status: 'recorded',
    stopOccurrenceId: STOP_OCCURRENCE_ID,
    tripDocumentId: null,
    tripId: '00000000-0000-4000-8000-0000000000a4',
  }

  test('cada foto sai com link assinado e o rótulo da vaga; onde ela mora no bucket nunca sai', async () => {
    const signed: string[] = []
    const useCase = createOccurrenceChargeReportUseCase({
      downloads: {
        createDownloadUrl: async (location) => {
          signed.push(`${location.bucket}/${location.objectKey}`)
          return {
            expiresAt: '2026-11-10T12:05:00.000Z',
            url: `https://signed/${location.fileName}`,
          }
        },
      },
      report: {
        read: async () => ({
          items: [record],
          nextCursor: null,
          totals: { byChargeType: [], totalAmount: '45.9000', totalCount: 1 },
        }),
      },
    })

    const page = await useCase.read.execute({
      context: COMPANY_CONTEXT as never,
      filters: { limit: 50 },
    })

    expect(signed).toEqual(['privado/tenants/x/placa', 'privado/tenants/x/recibo'])
    expect(page.items[0]?.photos).toEqual([
      {
        expiresAt: '2026-11-10T12:05:00.000Z',
        label: 'Foto da placa',
        slotKey: 'charge_sign',
        url: 'https://signed/charge_sign',
      },
      {
        expiresAt: '2026-11-10T12:05:00.000Z',
        label: 'Comprovante',
        slotKey: 'payment_receipt',
        url: 'https://signed/payment_receipt',
      },
    ])
    expect(JSON.stringify(page)).not.toContain('objectKey')
    expect(page.items[0]?.receivingCharge?.paidBy).toBe('driver')
  })
})

describe('a marca "cobra no recebimento" do cliente (spec 317 E7, CA5, T6)', () => {
  function createFixture(permissions: readonly CompanyPermission[]) {
    const flags = new Map<string, DeliveryClientReceivingChargeFlag>([
      [
        CLIENT_ID,
        { flaggedAt: '2026-11-10T10:00:00.000Z', sourceStopOccurrenceId: STOP_OCCURRENCE_ID },
      ],
    ])
    const calls: string[] = []
    const routes = createDeliveryClientReceivingChargeFlagRoutes({
      clearFlag: {
        async execute(input) {
          calls.push(
            `clear:${input.context.companyId}:${input.deliveryClientId}:${input.correlationId}`,
          )
          if (!flags.has(input.deliveryClientId)) return null
          const cleared = { flaggedAt: null, sourceStopOccurrenceId: null }
          flags.set(input.deliveryClientId, cleared)
          return cleared
        },
      },
      readFlag: {
        async execute(input) {
          calls.push(`read:${input.context.companyId}:${input.deliveryClientId}`)
          return flags.get(input.deliveryClientId) ?? null
        },
      },
    })
    const router = createTestRouter({ context: authenticatedContext(new Set(permissions)), routes })
    const handleRequest = createRequestHandler({
      createCorrelationId: () => CORRELATION_ID,
      frontendOrigins: [FRONTEND_ORIGIN],
      logger: { error() {}, info() {}, warn() {} },
      requestTimeoutSeconds: 10,
      router,
    })
    return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
  }

  test('ler devolve a data e a ocorrência de origem; a empresa vem do contexto', async () => {
    const fixture = createFixture(['fleet.read'])
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: FLAG_PATH }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: { flaggedAt: '2026-11-10T10:00:00.000Z', sourceStopOccurrenceId: STOP_OCCURRENCE_ID },
    })
    expect(fixture.calls).toEqual([`read:${COMPANY_CONTEXT.companyId}:${CLIENT_ID}`])
  })

  test('limpar exige `fleet.manage`; com ela, zera a marca', async () => {
    const reader = createFixture(['fleet.read'])
    const refused = await reader.handle(jsonRequest({ method: 'DELETE', path: FLAG_PATH }))
    expect(refused.status).toBe(403)
    expect(reader.calls).toEqual([])

    const manager = createFixture(['fleet.manage'])
    const response = await manager.handle(jsonRequest({ method: 'DELETE', path: FLAG_PATH }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: { flaggedAt: null, sourceStopOccurrenceId: null },
    })
  })

  test('cliente de outra empresa (ou inexistente) e id que não é uuid são 404', async () => {
    const fixture = createFixture(['fleet.read', 'fleet.manage'])
    const path = `/delivery-clients/${OTHER_COMPANY_CLIENT_ID}/receiving-charge-flag`
    for (const method of ['GET', 'DELETE'] as const) {
      const response = await fixture.handle(jsonRequest({ method, path }))
      expect(response.status).toBe(404)
      expect((await responseApiError(response)).code).toBe('DELIVERY_CLIENT_NOT_FOUND')
    }
    const invalid = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/delivery-clients/abc/receiving-charge-flag' }),
    )
    expect(invalid.status).toBe(404)
    expect(fixture.calls.some((call) => call.includes(':abc'))).toBe(false)
  })
})
