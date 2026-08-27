/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { ContractorDelivery } from '../../src/contractor-portal/application/contractor-portal.types.js'
import type { TripStopSchedule } from '../../src/delivery-clients/application/trip-stop-schedule.use-case.js'
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

const PING = {
  latitude: '-21.1767000',
  longitude: '-47.8208000',
  recordedAt: '2026-08-28T11:30:00.000Z',
}

const SCHEDULE: TripStopSchedule = {
  divergedAt: null,
  id: '00000000-0000-4000-8000-000000000902',
  notes: 'Doca 3',
  protocol: 'AG-99',
  scheduledAt: '2026-08-28T13:00:00.000Z',
  status: 'confirmed',
  stopId: '00000000-0000-4000-8000-000000000903',
}

function createFixture(permissions?: CompanyContext['permissions']) {
  const calls: unknown[] = []
  const locationCalls: unknown[] = []
  const scheduleCalls: unknown[] = []

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
        readDeliveryLocation: {
          async execute(input) {
            locationCalls.push(structuredClone(input))
            return PING
          },
        },
        scheduleDelivery: {
          async execute(input) {
            scheduleCalls.push(structuredClone(input))
            return SCHEDULE
          },
        },
      }),
    }),
  })

  return {
    calls,
    locationCalls,
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
    scheduleCalls,
  }
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
      readDeliveryLocation: {
        async execute() {
          return PING
        },
      },
      scheduleDelivery: {
        async execute() {
          return SCHEDULE
        },
      },
    })

    expect(routes[0]?.policy).toEqual({ permission: 'deliveries.track', scope: 'company' })
  })

  /**
   * ADR-0050 §6: o portal nomeia a nota **pela chave de acesso**, e o servidor descobre a parada —
   * é assim que a rota de agendamento também não recebe id interno nenhum.
   */
  test('agenda pela chave de acesso, canonicalizada', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { protocol: 'AG-99', scheduledAt: '2026-08-28T13:00:00.000Z', status: 'confirmed' },
        method: 'POST',
        path: `/client/me/deliveries/${DELIVERY.accessKey.toLowerCase()}/schedule`,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.scheduleCalls).toHaveLength(1)
    expect((fixture.scheduleCalls[0] as { accessKey: string }).accessKey).toBe(DELIVERY.accessKey)
    expect((fixture.scheduleCalls[0] as { values: unknown }).values).toEqual({
      notes: '',
      protocol: 'AG-99',
      scheduledAt: '2026-08-28T13:00:00.000Z',
      status: 'confirmed',
    })
  })

  /**
   * `pending` e `requested` são movimentos da transportadora — é ela que pede. Oferecê-los aqui
   * deixaria o portal escrever pendência em nome de quem deveria resolvê-la.
   */
  test('só confirma ou recusa, e recusa chave que não é chave', async () => {
    const fixture = createFixture()

    const requested = await fixture.handle(
      jsonRequest({
        body: { status: 'requested' },
        method: 'POST',
        path: `/client/me/deliveries/${DELIVERY.accessKey}/schedule`,
      }),
    )
    expect(requested.status).toBe(400)

    const invalidKey = await fixture.handle(
      jsonRequest({
        body: { status: 'refused' },
        method: 'POST',
        path: '/client/me/deliveries/123/schedule',
      }),
    )
    expect(invalidKey.status).toBe(400)
    expect(fixture.scheduleCalls).toEqual([])
  })

  /** O agendamento devolvido não carrega id de parada nem de viagem. */
  test('o agendamento devolvido não leva id interno', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { scheduledAt: '2026-08-28T13:00:00.000Z', status: 'confirmed' },
        method: 'POST',
        path: `/client/me/deliveries/${DELIVERY.accessKey}/schedule`,
      }),
    )
    const payload = await response.text()

    expect(payload).not.toContain(SCHEDULE.stopId)
    expect(payload).not.toContain(SCHEDULE.id)
    expect(payload).toContain('AG-99')
  })

  /**
   * ADR-0050 §5, terceira guarda: o cliente vê **a carga**, não quem dirige. Coordenada e hora, e
   * mais nada — sem isso o portal seria um rastreador de pessoa disfarçado de rastreador de carga.
   */
  test('a posição sai sem nada que identifique quem dirige', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `/client/me/deliveries/${DELIVERY.accessKey}/location` }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: Record<string, unknown> }
    expect(Object.keys(body.data).sort()).toEqual(['latitude', 'longitude', 'recordedAt'])
  })

  /**
   * Sem rastro é `data: null`, não `404`: a chave é dele e existe — o que não existe é posição agora.
   * Responder ausência faria a tela dizer "nota não encontrada" para uma nota que acabou de listar.
   */
  test('sem rastro devolve data nula, não ausência de nota', async () => {
    const handleRequest = createRequestHandler({
      createCorrelationId: () => CORRELATION_ID,
      frontendOrigins: [FRONTEND_ORIGIN],
      logger: { error() {}, info() {}, warn() {} },
      requestTimeoutSeconds: 10,
      router: createTestRouter({
        context: authenticatedContext(TRACK_PERMISSIONS),
        routes: createContractorDeliveryRoutes({
          listDeliveries: {
            async execute() {
              return []
            },
          },
          readDeliveryLocation: {
            async execute() {
              return null
            },
          },
          scheduleDelivery: {
            async execute() {
              return SCHEDULE
            },
          },
        }),
      }),
    })

    const response = await handleRequest(
      jsonRequest({ method: 'GET', path: `/client/me/deliveries/${DELIVERY.accessKey}/location` }),
      { timeout() {} },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: null })
  })
})
