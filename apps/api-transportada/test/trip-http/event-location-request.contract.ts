/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0081 §3/§5 / spec 196 T3.2: a fronteira HTTP do ponto do toque. As cinco rotas do motorista
 * que ainda não aceitavam `location` passam a aceitá-lo — `dispatch`, `start-route`, `confirm-load`
 * e as duas ocorrências —, com a mesma regra das que já aceitavam: inteiro ou nada, precisão acima
 * do teto da coluna gravada **no teto** (nunca `400`), e rota do escritório continua recusando.
 */
import { describe, expect, test } from 'bun:test'

import { EVENT_LOCATION_ACCURACY_MAX_METERS } from '../../src/database/event-location.schema.js'
import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type { RegisteredRouterRoute } from '../../src/http/router.service.js'
import { ApiError } from '../../src/shared/api.error.js'
import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes.js'
import { createTripFieldOfficeTripRoutes } from '../../src/trips/presentation/trip-field-office-trip.routes.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const TRIP_ID = '00000000-0000-4000-8000-0000000000a1'
const STOP_ID = '00000000-0000-4000-8000-0000000000b1'
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000c1'
const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const NOT_CALLED = () => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

const POINT_BODY = {
  accuracyMeters: 12.5,
  capturedAt: '2026-10-02T12:00:00.000Z',
  latitude: -23.55052,
  longitude: -46.633309,
} as const

const POINT_PARSED = {
  accuracyMeters: '12.50',
  capturedAt: '2026-10-02T12:00:00.000Z',
  latitude: '-23.5505200',
  longitude: '-46.6333090',
} as const

type Call = { readonly name: string; readonly input: Record<string, unknown> }

function buildDriverWorld() {
  const calls: Call[] = []
  const record = <TResult>(name: string, result: TResult) => {
    return async (input: Record<string, unknown>): Promise<TResult> => {
      calls.push({ input, name })
      return result
    }
  }
  const routes = createMeTripRoutes({
    attachProof: NOT_CALLED,
    cancelStopDeparture: NOT_CALLED,
    confirmOccurrenceUpload: NOT_CALLED,
    createOccurrenceUpload: NOT_CALLED,
    dispatchCurrentTrip: record('dispatch', { tripStatus: 'dispatched' }),
    findCurrentTrip: NOT_CALLED,
    listFieldOccurrenceTypes: NOT_CALLED,
    readDeliveryProofs: NOT_CALLED,
    readManifestXml: NOT_CALLED,
    registerDriverOccurrence: record('documentOccurrence', {
      createdAt: '2026-10-02T12:00:00.000Z',
      id: 'occurrence-1',
      note: '',
      occurrenceTypeId: OCCURRENCE_TYPE_ID,
      productCode: '',
      stage: 'delivery',
      typeName: 'Recusa',
    }),
    renderManifestDamdfe: NOT_CALLED,
    reportArrival: record('arrival', { id: 'event-1' }),
    reportDeparture: NOT_CALLED,
    reportDelivery: NOT_CALLED,
    reportOccurrence: record('stopOccurrence', { id: 'occurrence-1' }),
    reportReturn: NOT_CALLED,
    resolveDriverId: async () => DRIVER_ID,
    startFieldTrip: record('startFieldTrip', {
      changed: true,
      tripId: TRIP_ID,
      tripStatus: 'in_transit',
    }),
  })

  return { calls, routes }
}

function driverContext(): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '00000000-0000-4000-8000-000000000004',
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'driver',
      userId: '00000000-0000-4000-8000-000000000001',
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000003',
      permissions: resolveCompanyPermissions(['driver']),
      roles: ['driver'],
      userId: '00000000-0000-4000-8000-000000000001',
    },
  }
}

function findRoute(
  routes: readonly RegisteredRouterRoute[],
  pathname: string,
): RegisteredRouterRoute {
  const route = routes.find(
    (candidate) => candidate.method === 'POST' && candidate.pathname === pathname,
  )
  if (route === undefined) throw new Error(`ROUTE_NOT_FOUND:${pathname}`)

  return route
}

type SendParams = {
  readonly body?: unknown
  readonly pathParameters?: Record<string, string> | undefined
  readonly route: RegisteredRouterRoute
}

async function send({ body, pathParameters = {}, route }: SendParams): Promise<Response> {
  const headers = new Headers({ 'idempotency-key': 'key-1' })
  if (body !== undefined) headers.set('content-type', 'application/json')

  return route.execute({
    context: driverContext(),
    correlationId: 'correlation-1',
    pathParameters,
    request: new Request(`http://localhost${route.pathname}`, {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers,
      method: 'POST',
    }),
  })
}

async function expectInvalidRequest(operation: Promise<unknown>): Promise<ApiError> {
  try {
    await operation
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)

    return error as ApiError
  }

  throw new Error('EXPECTED_400')
}

/** A rota do motorista, o caminho dela e o corpo mínimo válido — sem `location`. */
type TapRoute = {
  readonly body: Record<string, unknown>
  readonly call?: string
  readonly name: string
  readonly params?: Record<string, string>
  readonly pathname: string
}

const DRIVER_TAP_ROUTES: TapRoute[] = [
  {
    body: { tripId: TRIP_ID },
    call: 'dispatch',
    name: 'dispatch',
    params: {},
    pathname: '/me/trips/current/dispatch',
  },
  {
    body: {},
    call: 'startFieldTrip',
    name: 'start-route',
    params: {},
    pathname: '/me/trips/current/start-route',
  },
  {
    body: {},
    call: 'startFieldTrip',
    name: 'confirm-load',
    params: {},
    pathname: '/me/trips/current/confirm-load',
  },
  {
    body: { kind: 'other' },
    call: 'stopOccurrence',
    name: 'ocorrência da parada',
    params: { stopId: STOP_ID },
    pathname: '/me/trips/current/stops/:stopId/occurrences',
  },
  {
    body: { note: 'recusou', occurrenceTypeId: OCCURRENCE_TYPE_ID, productCode: '' },
    call: 'documentOccurrence',
    name: 'ocorrência da nota',
    params: { documentId: DOCUMENT_ID },
    pathname: '/me/trips/current/documents/:documentId/occurrences',
  },
]

describe('as rotas de toque do motorista aceitam location (T3.2)', () => {
  test.each(DRIVER_TAP_ROUTES)('$name leva o ponto até o caso de uso', async (tap) => {
    const { calls, routes } = buildDriverWorld()

    const response = await send({
      body: { ...tap.body, location: POINT_BODY },
      pathParameters: tap.params,
      route: findRoute(routes, tap.pathname),
    })

    expect(response.status).toBeLessThan(300)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.name).toBe(tap.call)
    expect(calls[0]?.input.location).toEqual(POINT_PARSED)
  })

  test.each(DRIVER_TAP_ROUTES)('$name sem location grava ponto null', async (tap) => {
    const { calls, routes } = buildDriverWorld()

    await send({
      body: tap.body,
      pathParameters: tap.params,
      route: findRoute(routes, tap.pathname),
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.input.location).toBeNull()
  })

  test.each(DRIVER_TAP_ROUTES)('$name aceita location: null', async (tap) => {
    const { calls, routes } = buildDriverWorld()

    await send({
      body: { ...tap.body, location: null },
      pathParameters: tap.params,
      route: findRoute(routes, tap.pathname),
    })

    expect(calls[0]?.input.location).toBeNull()
  })

  test('o corpo do dispatch leva o tripId junto do ponto', async () => {
    const { calls, routes } = buildDriverWorld()

    await send({
      body: { location: POINT_BODY, tripId: TRIP_ID },
      route: findRoute(routes, '/me/trips/current/dispatch'),
    })

    expect(calls[0]?.input.tripId).toBe(TRIP_ID)
  })
})

describe('a ocorrência da parada continua pedindo um dos dois: tipo do catálogo ou kind (T3.2)', () => {
  const stopOccurrence = '/me/trips/current/stops/:stopId/occurrences'

  test.each([
    { body: { kind: 'other', occurrenceTypeId: OCCURRENCE_TYPE_ID }, name: 'os dois juntos' },
    { body: { description: 'sem tipo' }, name: 'nenhum dos dois' },
    { body: { kind: 'inventado' }, name: 'kind fora da lista' },
  ])('$name é 400 e nada é gravado', async ({ body }) => {
    const { calls, routes } = buildDriverWorld()

    await expectInvalidRequest(
      send({
        body: { ...body, location: POINT_BODY },
        pathParameters: { stopId: STOP_ID },
        route: findRoute(routes, stopOccurrence),
      }),
    )
    expect(calls).toHaveLength(0)
  })

  test('o tipo do catálogo sozinho passa, sem kind', async () => {
    const { calls, routes } = buildDriverWorld()

    await send({
      body: { location: POINT_BODY, occurrenceTypeId: OCCURRENCE_TYPE_ID },
      pathParameters: { stopId: STOP_ID },
      route: findRoute(routes, stopOccurrence),
    })

    expect(calls[0]?.input.occurrenceTypeId).toBe(OCCURRENCE_TYPE_ID)
    expect(calls[0]?.input.kind).toBeUndefined()
  })
})

describe('start-route e confirm-load: corpo vazio continua 200 (T3.2)', () => {
  const stepPaths = ['/me/trips/current/start-route', '/me/trips/current/confirm-load']

  test.each(stepPaths)(
    '%s sem corpo nem content-type responde 200 com ponto null',
    async (path) => {
      const { calls, routes } = buildDriverWorld()

      const response = await send({ route: findRoute(routes, path) })

      expect(response.status).toBe(200)
      expect(calls[0]?.input.location).toBeNull()
    },
  )

  test.each(stepPaths)('%s com {} responde 200 com ponto null', async (path) => {
    const { calls, routes } = buildDriverWorld()

    const response = await send({ body: {}, route: findRoute(routes, path) })

    expect(response.status).toBe(200)
    expect(calls[0]?.input.location).toBeNull()
  })

  test.each(stepPaths)('%s com chave desconhecida é 400', async (path) => {
    const { calls, routes } = buildDriverWorld()

    await expectInvalidRequest(
      send({ body: { driverId: DRIVER_ID }, route: findRoute(routes, path) }),
    )
    expect(calls).toHaveLength(0)
  })
})

describe('location parcial é 400 em location, e nada é gravado (T3.2)', () => {
  const PARTIAL_LOCATIONS = [
    { latitude: -23.55 },
    { longitude: -46.63 },
    { capturedAt: POINT_BODY.capturedAt, latitude: -23.55 },
    { latitude: -23.55, longitude: -46.63 },
    { capturedAt: POINT_BODY.capturedAt, longitude: -46.63 },
    {},
  ]

  test.each(DRIVER_TAP_ROUTES)('$name recusa location pela metade', async (tap) => {
    for (const partial of PARTIAL_LOCATIONS) {
      const { calls, routes } = buildDriverWorld()

      const error = await expectInvalidRequest(
        send({
          body: { ...tap.body, location: partial },
          pathParameters: tap.params,
          route: findRoute(routes, tap.pathname),
        }),
      )

      expect(error.details?.some((detail) => detail.field.startsWith('location'))).toBe(true)
      expect(calls).toHaveLength(0)
    }
  })

  test.each(DRIVER_TAP_ROUTES)('$name recusa latitude fora da faixa e chave extra', async (tap) => {
    for (const location of [
      { ...POINT_BODY, latitude: 91 },
      { ...POINT_BODY, longitude: -181 },
      { ...POINT_BODY, accuracyMeters: -1 },
      { ...POINT_BODY, altitude: 760 },
    ]) {
      const { calls, routes } = buildDriverWorld()

      await expectInvalidRequest(
        send({
          body: { ...tap.body, location },
          pathParameters: tap.params,
          route: findRoute(routes, tap.pathname),
        }),
      )
      expect(calls).toHaveLength(0)
    }
  })

  test('o 400 não devolve a coordenada que o aparelho mandou', async () => {
    const { routes } = buildDriverWorld()

    const error = await expectInvalidRequest(
      send({
        body: { location: { ...POINT_BODY, latitude: 91 }, tripId: TRIP_ID },
        route: findRoute(routes, '/me/trips/current/dispatch'),
      }),
    )

    expect(JSON.stringify({ details: error.details, message: error.message })).not.toContain(
      '-46.633309',
    )
  })
})

describe('precisão acima do teto é gravada no teto, nunca 400 (T3.2)', () => {
  const CEILING = EVENT_LOCATION_ACCURACY_MAX_METERS.toFixed(2)
  const ROUTES_WITH_POINT: TapRoute[] = [
    ...DRIVER_TAP_ROUTES,
    {
      body: {},
      call: 'arrival',
      name: 'chegada (já aceitava)',
      params: { stopId: STOP_ID },
      pathname: '/me/trips/current/stops/:stopId/arrive',
    },
  ]

  test('o teto é o de numeric(10,2)', () => {
    expect(CEILING).toBe('99999999.99')
  })

  test.each(ROUTES_WITH_POINT)('$name grava 1e12 metros no teto', async (tap) => {
    const { calls, routes } = buildDriverWorld()

    const response = await send({
      body: { ...tap.body, location: { ...POINT_BODY, accuracyMeters: 1e12 } },
      pathParameters: tap.params,
      route: findRoute(routes, tap.pathname),
    })

    expect(response.status).toBeLessThan(300)
    expect(calls[0]?.input.location).toEqual({ ...POINT_PARSED, accuracyMeters: CEILING })
  })

  test('o teto exato e o logo abaixo ficam como vieram; zero continua zero', async () => {
    const accuracies = [
      [99_999_999.99, '99999999.99'],
      [99_999_999.989, '99999999.99'],
      [99_999_999.994, '99999999.99'],
      [0, '0.00'],
    ] as const

    for (const [sent, stored] of accuracies) {
      const { calls, routes } = buildDriverWorld()

      await send({
        body: { location: { ...POINT_BODY, accuracyMeters: sent }, tripId: TRIP_ID },
        route: findRoute(routes, '/me/trips/current/dispatch'),
      })

      expect(calls[0]?.input.location).toEqual({ ...POINT_PARSED, accuracyMeters: stored })
    }
  })

  test('sem precisão, o ponto segue com precisão null', async () => {
    const { calls, routes } = buildDriverWorld()
    const withoutAccuracy = {
      capturedAt: POINT_BODY.capturedAt,
      latitude: POINT_BODY.latitude,
      longitude: POINT_BODY.longitude,
    }

    await send({
      body: { location: withoutAccuracy, tripId: TRIP_ID },
      route: findRoute(routes, '/me/trips/current/dispatch'),
    })

    expect(calls[0]?.input.location).toEqual({ ...POINT_PARSED, accuracyMeters: null })
  })
})

describe('rota do escritório com location é 400 (T3.2)', () => {
  const OFFICE_CALLS: string[] = []
  const officeRoutes = [
    ...createTripFieldOfficeTripRoutes({
      reportArrival: NOT_CALLED,
      reportOccurrence: NOT_CALLED,
      resolveClientIp: () => '127.0.0.1',
      startFieldTrip: NOT_CALLED,
      targets: new Proxy({} as never, {
        get: () => () => {
          OFFICE_CALLS.push('targets')
          throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
        },
      }),
    }),
    ...createTripRoutes(new Proxy({} as never, { get: () => ({ execute: NOT_CALLED }) })),
  ]
  const OFFICE_TAPS: TapRoute[] = [
    { body: {}, name: 'despacho', pathname: '/trips/:id/dispatch' },
    { body: {}, name: 'start-route', pathname: '/trips/:id/start-route' },
    { body: {}, name: 'confirm-load', pathname: '/trips/:id/confirm-load' },
    { body: {}, name: 'chegada', pathname: '/trips/:id/stops/:stopId/arrive' },
    {
      body: { kind: 'other' },
      name: 'ocorrência da parada',
      pathname: '/trips/:id/stops/:stopId/occurrences',
    },
    {
      body: { occurrenceTypeId: OCCURRENCE_TYPE_ID },
      name: 'ocorrência da parada (tipo do catálogo)',
      pathname: '/trips/:id/stops/:stopId/occurrences',
    },
  ]
  const PATH_PARAMETERS = { id: TRIP_ID, stopId: STOP_ID }

  test.each(OFFICE_TAPS)('$name do escritório recusa location', async (tap) => {
    const route = findRoute(officeRoutes, tap.pathname)

    await expectInvalidRequest(
      send({ body: { ...tap.body, location: POINT_BODY }, pathParameters: PATH_PARAMETERS, route }),
    )
    expect(OFFICE_CALLS).toEqual([])
  })

  test.each(OFFICE_TAPS)('$name do escritório sem location passa do parse', async (tap) => {
    const route = findRoute(officeRoutes, tap.pathname)

    // o dublê de dependência lança ao ser tocado: chegar nele prova que o corpo foi aceito.
    await expect(send({ body: tap.body, pathParameters: PATH_PARAMETERS, route })).rejects.toThrow(
      'ROUTE_DEPENDENCY_NOT_EXPECTED',
    )
  })
})
