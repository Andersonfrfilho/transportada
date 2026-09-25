/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createReadLocationConsentUseCase } from '../../src/trips/application/read-location-consent.use-case.js'
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
    purgeStalePings: async () => 0,
    readCurrentTracking: async () => null,
    readLastPing: async () => null,
    async recordPing(input) {
      recorded.push(input)
    },
    readConsent: async () => ({ acceptedAt: null }),
    setConsent: async () => ({ acceptedAt: null }),
    ...overrides,
  }

  return { recorded, repository }
}

/** Despachada agora: dentro da janela do rastro, que é o caso destes contratos. */
function trackingOf(
  hasConsent: boolean,
  dispatchedAt: Date | null = new Date(),
): DriverTrackingState {
  return { dispatchedAt, hasConsent, tripId: TRIP_ID }
}

function buildHandler(
  routes: ReturnType<typeof createMeLocationRoutes>,
  permissions: CompanyContext['permissions'] = REPORT_PERMISSIONS,
) {
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({ context: authenticatedContext(permissions), routes }),
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
        readConsent: async () => ({ acceptedAt: null }),
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
        readConsent: async () => ({ acceptedAt: null }),
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

  /** Segurança L4 (spec 189 T9.2): o regex aceita o formato, mas o globo tem intervalo. */
  test('recusa coordenada fora do intervalo do globo', async () => {
    const handle = buildHandler(
      createMeLocationRoutes({
        readConsent: async () => ({ acceptedAt: null }),
        recordLocation: async () => ({ outcome: 'recorded' }),
        resolveDriverId: async () => DRIVER_ID,
        setConsent: async () => ({ acceptedAt: null }),
      }),
    )

    const latitudeOutOfRange = await handle(
      jsonRequest({
        body: { latitude: '90.0000001', longitude: '0' },
        method: 'POST',
        path: '/me/trips/current/location',
      }),
    )
    expect(latitudeOutOfRange.status).toBe(400)

    const longitudeOutOfRange = await handle(
      jsonRequest({
        body: { latitude: '0', longitude: '180.0000001' },
        method: 'POST',
        path: '/me/trips/current/location',
      }),
    )
    expect(longitudeOutOfRange.status).toBe(400)

    const atTheBoundary = await handle(
      jsonRequest({
        body: { latitude: '-90', longitude: '180' },
        method: 'POST',
        path: '/me/trips/current/location',
      }),
    )
    expect(atTheBoundary.status).toBe(201)
  })

  /** O ignorado responde `202` para o log de produção distinguir sem abrir o banco. */
  test('o ignorado responde 202, e o gravado 201', async () => {
    const handle = buildHandler(
      createMeLocationRoutes({
        readConsent: async () => ({ acceptedAt: null }),
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
        readConsent: async () => ({ acceptedAt: null }),
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

describe('o teto de idade da viagem (ADR-0056 §2)', () => {
  const ping = { companyId: COMPANY_ID, driverId: DRIVER_ID, latitude: '0', longitude: '0' }
  const NOW = new Date('2026-09-03T18:00:00.000Z')
  const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000)

  /* A viagem esquecida aberta na sexta não acompanha o motorista no fim de semana. */
  test('não grava o ping de viagem aberta há tempo demais', async () => {
    const { recorded, repository } = buildRepository({
      readCurrentTracking: async () => trackingOf(true, hoursAgo(48)),
    })
    const useCase = createRecordTripLocationUseCase({ repository })

    const result = await useCase({ ...ping, now: NOW })

    expect(result.outcome).toBe('ignored')
    expect(recorded).toEqual([])
  })

  test('a viagem do dia continua gravando', async () => {
    const { recorded, repository } = buildRepository({
      readCurrentTracking: async () => trackingOf(true, hoursAgo(8)),
    })
    const useCase = createRecordTripLocationUseCase({ repository })

    const result = await useCase({ ...ping, now: NOW })

    expect(result.outcome).toBe('recorded')
    expect(recorded).toHaveLength(1)
  })

  /**
   * ⚠️ **Ausência de data não é idade, e este caso já foi o contrário.** A primeira versão recusava
   * o ping com `dispatchedAt` nulo, lendo a ausência como "viagem que nunca saiu" — e o teste
   * afirmava isso. Mas a data vem de `trip_dispatch_snapshots` por `leftJoin` (`trips` **não tem**
   * `dispatched_at`), então toda viagem sem snapshot perdia o rastro em silêncio: o motorista
   * mandando posição, o portal do contratante vazio, e nada acusando.
   *
   * `checkTrackingWindow` foi corrigida e este teste ficou para trás, vermelho na staging,
   * afirmando a versão abandonada. Sem data não há o que comparar, e a resposta honesta é deixar
   * passar — o prazo da ADR-0056 §2 continua cumprido por `resolveTrackingPurgeCutoff`, que corta o
   * ping velho tenha a viagem fechado ou não.
   */
  test('sem data de despacho o ping passa, e quem corta é o expurgo', async () => {
    const { recorded, repository } = buildRepository({
      readCurrentTracking: async () => trackingOf(true, null),
    })
    const useCase = createRecordTripLocationUseCase({ repository })

    const result = await useCase({ ...ping, now: NOW })

    expect(result.outcome).toBe('recorded')
    expect(recorded).toHaveLength(1)
  })
})

/**
 * Segurança M3 (spec 189 T9.2): o rate limit do Postgres corta abuso, mas não o replay bem
 * comportado — o mesmo celular reenviando o ping do minuto anterior por causa de retry de rede.
 */
describe('o dedup do ping de posição (spec 189 T9.2)', () => {
  const ping = { companyId: COMPANY_ID, driverId: DRIVER_ID, latitude: '0', longitude: '0' }
  const NOW = new Date('2026-09-03T18:00:00.000Z')
  const secondsAgo = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString()

  test('ignora o ping que repete o anterior antes de 45 s', async () => {
    const { recorded, repository } = buildRepository({
      readCurrentTracking: async () => trackingOf(true),
      readLastPing: async () => ({ latitude: '0', longitude: '0', recordedAt: secondsAgo(10) }),
    })
    const useCase = createRecordTripLocationUseCase({ repository })

    const result = await useCase({ ...ping, now: NOW })

    expect(result.outcome).toBe('ignored')
    expect(recorded).toEqual([])
  })

  test('grava de novo passados 45 s do último ping', async () => {
    const { recorded, repository } = buildRepository({
      readCurrentTracking: async () => trackingOf(true),
      readLastPing: async () => ({ latitude: '0', longitude: '0', recordedAt: secondsAgo(60) }),
    })
    const useCase = createRecordTripLocationUseCase({ repository })

    const result = await useCase({ ...ping, now: NOW })

    expect(result.outcome).toBe('recorded')
    expect(recorded).toHaveLength(1)
  })

  test('grava o ping legítimo que chega 50 s depois por atraso de rede', async () => {
    const { recorded, repository } = buildRepository({
      readCurrentTracking: async () => trackingOf(true),
      readLastPing: async () => ({ latitude: '0', longitude: '0', recordedAt: secondsAgo(50) }),
    })
    const useCase = createRecordTripLocationUseCase({ repository })

    const result = await useCase({ ...ping, now: NOW })

    expect(result.outcome).toBe('recorded')
    expect(recorded).toHaveLength(1)
  })

  test('sem ping anterior, grava normalmente', async () => {
    const { recorded, repository } = buildRepository({
      readCurrentTracking: async () => trackingOf(true),
      readLastPing: async () => null,
    })
    const useCase = createRecordTripLocationUseCase({ repository })

    const result = await useCase({ ...ping, now: NOW })

    expect(result.outcome).toBe('recorded')
    expect(recorded).toHaveLength(1)
  })
})

/**
 * Spec 189 T7.4 (ADR-0075 §8, plan D8): o `PUT` existia sem leitura, e a app do motorista não tinha
 * como mostrar o interruptor na posição certa. A leitura mora na mesma política do `PUT`
 * (`trip.report`), e conta sem cadastro de motorista responde `409` nas duas.
 */
describe('a leitura do consentimento (spec 189 T7.4)', () => {
  function consentRoutes(
    readConsent: Parameters<typeof createMeLocationRoutes>[0]['readConsent'],
    resolveDriverId: () => Promise<string | null> = async () => DRIVER_ID,
  ) {
    return createMeLocationRoutes({
      readConsent,
      recordLocation: async () => ({ outcome: 'ignored' }),
      resolveDriverId,
      setConsent: async () => ({ acceptedAt: null }),
    })
  }

  test('devolve { data: { acceptedAt } } da conta autenticada, sem cache', async () => {
    const calls: unknown[] = []
    const handle = buildHandler(
      consentRoutes(async (input) => {
        calls.push(structuredClone(input))
        return { acceptedAt: '2026-09-25T10:00:00.000Z' }
      }),
    )

    const response = await handle(jsonRequest({ method: 'GET', path: '/me/location-consent' }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ data: { acceptedAt: '2026-09-25T10:00:00.000Z' } })
    /** A rota não aceita id de ninguém: a conta vem do contexto autenticado, nunca do pedido. */
    expect(Object.keys(calls[0] as Record<string, unknown>).sort()).toEqual([
      'companyId',
      'membershipId',
    ])
  })

  test('quem nunca consentiu lê null', async () => {
    const handle = buildHandler(consentRoutes(async () => ({ acceptedAt: null })))

    const response = await handle(jsonRequest({ method: 'GET', path: '/me/location-consent' }))

    expect(await response.json()).toEqual({ data: { acceptedAt: null } })
  })

  test('sem trip.report é 403, na leitura como na escrita', async () => {
    const handle = buildHandler(
      consentRoutes(async () => ({ acceptedAt: null })),
      new Set(['trip.read'] as const),
    )

    const read = await handle(jsonRequest({ method: 'GET', path: '/me/location-consent' }))
    const write = await handle(
      jsonRequest({ body: { accepted: true }, method: 'PUT', path: '/me/location-consent' }),
    )

    expect(read.status).toBe(403)
    expect(write.status).toBe(403)
  })

  test('conta sem cadastro de motorista: 409 DRIVER_NOT_REGISTERED na leitura e no PUT', async () => {
    const handle = buildHandler(
      createMeLocationRoutes({
        readConsent: createReadLocationConsentUseCase({
          repository: buildRepository().repository,
          resolveDriverId: async () => null,
        }),
        recordLocation: async () => ({ outcome: 'ignored' }),
        resolveDriverId: async () => null,
        setConsent: async () => ({ acceptedAt: null }),
      }),
    )

    const read = await handle(jsonRequest({ method: 'GET', path: '/me/location-consent' }))
    const write = await handle(
      jsonRequest({ body: { accepted: true }, method: 'PUT', path: '/me/location-consent' }),
    )

    expect(read.status).toBe(409)
    expect(((await read.json()) as { error: { code: string } }).error.code).toBe(
      'DRIVER_NOT_REGISTERED',
    )
    expect(write.status).toBe(409)
    expect(((await write.json()) as { error: { code: string } }).error.code).toBe(
      'DRIVER_NOT_REGISTERED',
    )
  })

  test('o caso de uso lê o consentimento do motorista que o vínculo resolveu', async () => {
    const reads: unknown[] = []
    const { repository } = buildRepository({
      async readConsent(input) {
        reads.push(structuredClone(input))
        return { acceptedAt: '2026-09-25T10:00:00.000Z' }
      },
    })
    const readConsent = createReadLocationConsentUseCase({
      repository,
      resolveDriverId: async () => DRIVER_ID,
    })

    const consent = await readConsent({ companyId: COMPANY_ID, membershipId: 'membership' })

    expect(consent).toEqual({ acceptedAt: '2026-09-25T10:00:00.000Z' })
    expect(reads).toEqual([{ companyId: COMPANY_ID, driverId: DRIVER_ID }])
  })
})
