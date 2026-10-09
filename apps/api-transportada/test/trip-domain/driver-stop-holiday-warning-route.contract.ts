/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.3 (ADR-0100 D12): `GET /me/trips/current` entrega `holidayWarnings` na parada exatamente como o
 * app do motorista valida (`cityIbgeCode` numérico, `cityName` ausente e nunca nulo, `reasons` com escopo,
 * origem e nome) — e a parada sem aviso não leva a chave.
 */
import { describe, expect, test } from 'bun:test'

import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type {
  DriverTrip,
  DriverTripStop,
  FindCurrentDriverTripResult,
} from '../../src/trips/application/find-current-driver-trip.use-case.js'
import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const CURRENT_TRIP_PATH = '/me/trips/current'

function buildStop(id: string, extra: Partial<DriverTripStop> = {}): DriverTripStop {
  return {
    arrivedAt: null,
    completedAt: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [],
    enRouteSince: null,
    enRouteTappedAt: null,
    id,
    label: 'Rua A, 1, Campinas, SP',
    latitude: null,
    longitude: null,
    schedule: null,
    sequence: 1,
    ...extra,
  }
}

function buildResult(stops: readonly DriverTripStop[]): FindCurrentDriverTripResult {
  const trip: DriverTrip = {
    createdAt: '2026-10-20T10:00:00.000Z',
    crewRole: 'driver',
    id: '00000000-0000-4000-8000-000000000030',
    manifest: null,
    status: 'in_transit',
    stops,
    vehiclePlate: 'ABC1D23',
  }
  return { isRegisteredDriver: true, pendingProofs: [], score: 85, trips: [trip] }
}

async function readCurrentTrip(result: FindCurrentDriverTripResult) {
  const notCalled = () => {
    throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
  }
  const routes = createMeTripRoutes(
    new Proxy({} as never, {
      get: (_target, key) =>
        key === 'findCurrentTrip' ? () => Promise.resolve(result) : notCalled,
    }),
  )
  const route = routes.find((candidate) => candidate.pathname === CURRENT_TRIP_PATH)
  if (route === undefined || route.method !== 'GET') throw new Error('EXPECTED_CURRENT_TRIP_ROUTE')

  const context = {
    scope: { companyId: COMPANY_ID, membershipId: 'membership-1', permissions: new Set<string>() },
  } as unknown as AuthenticatedContext<CompanyContext>
  const response = await route.execute({
    context,
    correlationId: 'correlation-1',
    pathParameters: {},
    request: new Request(`http://api.test${CURRENT_TRIP_PATH}`),
  })
  const body = (await response.json()) as {
    readonly data: {
      readonly trips: readonly { readonly stops: readonly Record<string, unknown>[] }[]
    }
  }
  return body.data.trips[0]?.stops ?? []
}

describe('GET /me/trips/current entrega o aviso como o app do motorista valida (spec 252 T4.3)', () => {
  test('a parada leva holidayWarnings no formato publicado; a sem aviso não leva a chave', async () => {
    const warned = buildStop('stop-warned', {
      holidayWarnings: [
        {
          cityIbgeCode: 3509502,
          date: '2026-10-21',
          reasons: [{ name: 'Aniversário', origin: 'imported', scope: 'municipal' }],
        },
      ],
    })

    const stops = await readCurrentTrip(buildResult([warned, buildStop('stop-plain')]))

    expect(stops[0]?.holidayWarnings).toEqual([
      {
        cityIbgeCode: 3509502,
        date: '2026-10-21',
        reasons: [{ name: 'Aniversário', origin: 'imported', scope: 'municipal' }],
      },
    ])
    expect('cityName' in ((stops[0]?.holidayWarnings as object[])[0] ?? {})).toBe(false)
    expect('holidayWarnings' in (stops[1] ?? {})).toBe(false)
  })
})
