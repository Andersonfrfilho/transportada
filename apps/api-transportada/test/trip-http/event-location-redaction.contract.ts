/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196 T4.1 (ADR-0081 §6): `GET /trips/:id/timeline` só entrega a coordenada a quem tem
 * `trip.event-location`. Quem não tem recebe 200, `location: null` e o `locationState` — o escritório
 * financeiro e o separador veem *que* o ponto existe ou falhou, nunca *onde*. O corpo inteiro é
 * varrido: a latitude e a longitude da fixture não podem aparecer em nenhum lugar do JSON.
 */
import { describe, expect, test } from 'bun:test'

import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { createReadTripTimelineUseCase } from '../../src/trips/application/read-trip-timeline.use-case.js'
import type {
  ReadTripTimelineResult,
  TripTimelineItem,
} from '../../src/trips/application/trip-timeline.types.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'
import { TRIP_ID, TRIPS_PATH } from '../fixtures/trip-http-payload.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const LATITUDE = -23.5505199
const LONGITUDE = -46.6333094
const PATH = `${TRIPS_PATH}/${TRIP_ID}/timeline`

const LOCATION_KEYS = ['accuracyMeters', 'capturedAt', 'distanceMeters', 'latitude', 'longitude']

function buildItem(overrides: Partial<TripTimelineItem>): TripTimelineItem {
  return {
    actorName: null,
    channel: 'driver_app',
    closeReason: null,
    document: null,
    fromStatus: null,
    id: '00000000-0000-4000-8000-0000000000a1',
    kind: 'stop.arrived',
    lateRegistration: false,
    location: null,
    locationState: null,
    occurrence: null,
    occurredAt: '2026-10-01T10:00:00.000Z',
    onBehalfOfDriverName: null,
    recordedAt: null,
    returnReason: null,
    stop: { id: '00000000-0000-4000-8000-0000000000b1', sequence: 1 },
    toStatus: null,
    ...overrides,
  }
}

const CAPTURED_ITEM = buildItem({
  location: {
    accuracyMeters: 12.5,
    capturedAt: '2026-10-01T10:00:00.000Z',
    distanceMeters: 48,
    latitude: LATITUDE,
    longitude: LONGITUDE,
  },
  locationState: 'captured',
})
const UNAVAILABLE_ITEM = buildItem({
  id: '00000000-0000-4000-8000-0000000000a2',
  locationState: 'unavailable',
})
const NOT_APPLICABLE_ITEM = buildItem({ id: '00000000-0000-4000-8000-0000000000a3' })

function companyContext(
  permissions: CompanyContext['permissions'],
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '00000000-0000-4000-8000-000000000004',
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'event-location-redaction-contract',
      userId: '00000000-0000-4000-8000-000000000001',
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000003',
      permissions,
      roles: ['operator'],
      userId: '00000000-0000-4000-8000-000000000001',
    },
  }
}

function unusedDependencies(): unknown {
  const handler: ProxyHandler<() => unknown> = {
    apply: () => unusedDependencies(),
    get: () => unusedDependencies(),
  }
  return new Proxy(() => unusedDependencies(), handler)
}

async function requestTimeline(permissions: CompanyContext['permissions']): Promise<Response> {
  const readTripTimeline = createReadTripTimelineUseCase({
    existence: {
      findTripCompanyScope: async () => ({ id: TRIP_ID }),
      findTripDocumentScope: async () => null,
    },
    reader: {
      listTripTimeline: async (): Promise<ReadTripTimelineResult> => ({
        items: [CAPTURED_ITEM, UNAVAILABLE_ITEM, NOT_APPLICABLE_ITEM],
        nextCursor: null,
      }),
    },
  })
  const dependencies = { ...(unusedDependencies() as Record<string, unknown>), readTripTimeline }
  const route = createTripRoutes(dependencies as never).find(
    (candidate) =>
      candidate.method === 'GET' && candidate.pathname === `${TRIPS_PATH}/:id/timeline`,
  )
  if (route === undefined) throw new Error('route missing')
  return route.execute({
    context: companyContext(permissions),
    correlationId: 'event-location-redaction-contract',
    pathParameters: { id: TRIP_ID },
    request: new Request(`http://localhost${PATH}`),
  })
}

type TimelineBody = { readonly data: { readonly items: readonly TripTimelineItem[] } }

describe('a linha do tempo recorta a coordenada sem trip.event-location (spec 196 T4.1)', () => {
  test.each([
    ['finance', new Set(['trip.report-on-behalf'] as const)],
    ['separator', new Set(['fleet.read'] as const)],
  ])('%s recebe 200 com location null e o locationState', async (_role, permissions) => {
    const response = await requestTimeline(permissions)

    expect(response.status).toBe(200)
    const body = (await response.json()) as TimelineBody
    expect(body.data.items.map((item) => item.location)).toEqual([null, null, null])
    expect(body.data.items.map((item) => item.locationState)).toEqual([
      'captured',
      'unavailable',
      null,
    ])
  })

  test.each([
    ['finance', new Set(['trip.report-on-behalf'] as const)],
    ['separator', new Set(['fleet.read'] as const)],
  ])('%s: a latitude e a longitude não aparecem em lugar nenhum do JSON', async (_role, perms) => {
    const response = await requestTimeline(perms)
    const text = await response.text()

    expect(text).not.toContain(String(LATITUDE))
    expect(text).not.toContain(String(LONGITUDE))
  })

  test('operator recebe a coordenada com exatamente as cinco chaves do contrato do painel', async () => {
    const response = await requestTimeline(new Set(['fleet.read', 'trip.event-location'] as const))

    expect(response.status).toBe(200)
    const body = (await response.json()) as TimelineBody
    const [captured, unavailable, notApplicable] = body.data.items
    expect(Object.keys(captured?.location ?? {}).sort()).toEqual(LOCATION_KEYS)
    expect(captured?.location).toEqual(CAPTURED_ITEM.location)
    expect(unavailable?.location).toBeNull()
    expect(unavailable?.locationState).toBe('unavailable')
    expect(notApplicable?.location).toBeNull()
    expect(notApplicable?.locationState).toBeNull()
  })
})
