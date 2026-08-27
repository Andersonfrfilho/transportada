/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRecordTripLocationUseCase } from '../../src/trips/application/record-trip-location.use-case.js'
import type {
  DriverTrackingState,
  TripLocationRepositoryPort,
} from '../../src/trips/application/trip-location.port.js'
import { createMeLocationRoutes } from '../../src/trips/presentation/me-location.routes.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000201'
const DRIVER_ID = '00000000-0000-4000-8000-000000000920'
const TRIP_ID = '00000000-0000-4000-8000-000000000921'

const REPORT_PERMISSIONS: CompanyContext['permissions'] = new Set(['trip.report'] as const)

function buildRepository(overrides: Partial<TripLocationRepositoryPort> = {}) {
  const recorded: unknown[] = []
  const repository: TripLocationRepositoryPort = {
    purgeByTrip: async () => {},
    readCurrentTracking: async () => null,
    readLastPing: async () => null,
    async recordPing(input) {
      recorded.push(input)
    },
    setConsent: async () => ({ acceptedAt: null }),
    ...overrides,
  }

  return { recorded, repository }
}

function trackingOf(hasConsent: boolean): DriverTrackingState {
  return { hasConsent, tripId: TRIP_ID }
}

function buildHandler(routes: ReturnType<typeof createMeLocationRoutes>) {
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({ context: authenticatedContext(REPORT_PERMISSIONS), routes }),
  })

  return (request: Request) => handleRequest(request, { timeout() {} })
}

describe('o rastro ao vivo do motorista (spec 063 T008)', () => {
  /** ADR-0050 §5: **sem consentimento não se grava.** É a primeira guarda, e ela é do domínio. */
  test('não grava posição de quem não consentiu', async () => {
    const { recorded, repository } = buildRepository({
      readCurrentTracking: async () => trackingOf(false),
    })
    const useCase = createRecordTripLocationUseCase({ repository })

    const result = await useCase({
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      latitude: '-21.1767000',
      longitude: '-47.8208000',
    })

    expect(result.outcome).toBe('ignored')
    expect(recorded).toEqual([])
  })

  /**
   * Fora de viagem responde igual a sem consentimento, de propósito: o app não precisa saber qual
   * das duas é, e distinguir daria ao celular um jeito de perguntar "esse motorista consentiu?".
   */
  test('fora de viagem é ignorado, não erro', async () => {
    const { recorded, repository } = buildRepository()
    const useCase = createRecordTripLocationUseCase({ repository })

    const result = await useCase({
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      latitude: '0',
      longitude: '0',
    })

    expect(result.outcome).toBe('ignored')
    expect(recorded).toEqual([])
  })

  test('grava com consentimento, na viagem que o próprio servidor resolveu', async () => {
    const { recorded, repository } = buildRepository({
      readCurrentTracking: async () => trackingOf(true),
    })
    const useCase = createRecordTripLocationUseCase({ repository })

    const result = await useCase({
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      latitude: '-21.1767000',
      longitude: '-47.8208000',
    })

    expect(result.outcome).toBe('recorded')
    expect(recorded).toEqual([
      {
        companyId: COMPANY_ID,
        driverId: DRIVER_ID,
        latitude: '-21.1767000',
        longitude: '-47.8208000',
        tripId: TRIP_ID,
      },
    ])
  })

  /** A rota não recebe id de viagem: o servidor resolve a viagem corrente do próprio motorista. */
  test('a rota do celular não nomeia viagem', async () => {
    const calls: unknown[] = []
    const handle = buildHandler(
      createMeLocationRoutes({
        async recordLocation(input) {
          calls.push(structuredClone(input))
          return { outcome: 'recorded' }
        },
        resolveDriverId: async () => DRIVER_ID,
        setConsent: async () => ({ acceptedAt: null }),
      }),
    )

    const response = await handle(
      jsonRequest({
        body: { latitude: '-21.1767000', longitude: '-47.8208000' },
        method: 'POST',
        path: '/me/trips/current/location',
      }),
    )

    expect(response.status).toBe(201)
    expect(Object.keys(calls[0] as Record<string, unknown>).sort()).toEqual([
      'companyId',
      'driverId',
      'latitude',
      'longitude',
    ])
  })

  /** Coordenada como número traria erro binário para dentro do campo — o mesmo motivo do dinheiro. */
  test('recusa coordenada numérica e fora do formato', async () => {
    const handle = buildHandler(
      createMeLocationRoutes({
        recordLocation: async () => ({ outcome: 'recorded' }),
        resolveDriverId: async () => DRIVER_ID,
        setConsent: async () => ({ acceptedAt: null }),
      }),
    )

    const numeric = await handle(
      jsonRequest({
        body: { latitude: -21.1767, longitude: -47.8208 },
        method: 'POST',
        path: '/me/trips/current/location',
      }),
    )
    expect(numeric.status).toBe(400)

    const malformed = await handle(
      jsonRequest({
        body: { latitude: '-21,1767', longitude: '-47.8208' },
        method: 'POST',
        path: '/me/trips/current/location',
      }),
    )
    expect(malformed.status).toBe(400)
  })

  /** O ignorado responde `202` para o log de produção distinguir sem abrir o banco. */
  test('o ignorado responde 202, e o gravado 201', async () => {
    const handle = buildHandler(
      createMeLocationRoutes({
        recordLocation: async () => ({ outcome: 'ignored' }),
        resolveDriverId: async () => DRIVER_ID,
        setConsent: async () => ({ acceptedAt: null }),
      }),
    )

    const response = await handle(
      jsonRequest({
        body: { latitude: '0', longitude: '0' },
        method: 'POST',
        path: '/me/trips/current/location',
      }),
    )

    expect(response.status).toBe(202)
  })

  /** O consentimento é do motorista, e ele o retira quando quiser — a rota aceita os dois sentidos. */
  test('o consentimento se dá e se retira pela mesma rota', async () => {
    const calls: unknown[] = []
    const handle = buildHandler(
      createMeLocationRoutes({
        recordLocation: async () => ({ outcome: 'ignored' }),
        resolveDriverId: async () => DRIVER_ID,
        async setConsent(input) {
          calls.push(structuredClone(input))
          return { acceptedAt: input.accepted ? '2026-08-28T10:00:00.000Z' : null }
        },
      }),
    )

    const accepted = await handle(
      jsonRequest({ body: { accepted: true }, method: 'PUT', path: '/me/location-consent' }),
    )
    expect(accepted.status).toBe(200)

    const revoked = await handle(
      jsonRequest({ body: { accepted: false }, method: 'PUT', path: '/me/location-consent' }),
    )
    expect(await revoked.json()).toEqual({ data: { acceptedAt: null } })
    expect(calls).toEqual([
      { accepted: true, companyId: COMPANY_ID, driverId: DRIVER_ID },
      { accepted: false, companyId: COMPANY_ID, driverId: DRIVER_ID },
    ])
  })
})
