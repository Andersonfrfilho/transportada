/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import {
  findCurrentDriverTrip,
  type DriverTrip,
} from '../../src/trips/application/find-current-driver-trip.use-case.js'
import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const NOW = new Date('2026-10-03T12:00:00.000Z')
const CURRENT_TRIP_PATH = '/me/trips/current'

const NOT_CALLED = () => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

function buildTrip(input: Pick<DriverTrip, 'crewRole' | 'id'>): DriverTrip {
  return {
    createdAt: '2026-10-03T09:00:00.000Z',
    crewRole: input.crewRole,
    id: input.id,
    manifest: null,
    status: 'dispatched',
    stops: [],
    vehiclePlate: 'GCQ8E47',
  }
}

/** A mesma pessoa dirige uma viagem e acompanha a outra: o papel é da linha da tripulação. */
const DRIVING_TRIP = buildTrip({ crewRole: 'driver', id: 'trip-driving' })
const HELPING_TRIP = buildTrip({ crewRole: 'helper', id: 'trip-helping' })

function buildCurrentTripRoute(trips: readonly DriverTrip[]) {
  const route = createMeTripRoutes({
    attachProof: NOT_CALLED,
    cancelStopDeparture: NOT_CALLED,
    confirmOccurrenceUpload: NOT_CALLED,
    createOccurrenceUpload: NOT_CALLED,
    dispatchCurrentTrip: NOT_CALLED,
    findCurrentTrip: async () => ({
      isRegisteredDriver: true,
      pendingProofs: [],
      score: null,
      trips,
    }),
    listFieldOccurrenceTypes: NOT_CALLED,
    readDeliveryProofs: NOT_CALLED,
    readManifestXml: NOT_CALLED,
    registerDriverOccurrence: NOT_CALLED,
    renderManifestDamdfe: NOT_CALLED,
    reportArrival: NOT_CALLED,
    reportDelivery: NOT_CALLED,
    reportDeparture: NOT_CALLED,
    reportOccurrence: NOT_CALLED,
    reportReturn: NOT_CALLED,
    resolveDriverId: NOT_CALLED,
    startFieldTrip: NOT_CALLED,
  }).find((candidate) => candidate.method === 'GET' && candidate.pathname === CURRENT_TRIP_PATH)
  if (route === undefined) throw new Error('rota ausente: GET /me/trips/current')
  return route
}

async function readSerializedTrips(
  trips: readonly DriverTrip[],
): Promise<readonly Record<string, unknown>[]> {
  const response = await buildCurrentTripRoute(trips).execute({
    context: {
      identity: {
        companyIdClaim: COMPANY_ID,
        externalIdentityId: '00000000-0000-4000-8000-000000000004',
        issuer: 'https://issuer.test',
        platformAdmin: false,
        serviceAccount: false,
        subject: 'helper',
        userId: '00000000-0000-4000-8000-000000000005',
      },
      scope: {
        companyId: COMPANY_ID,
        kind: 'company',
        membershipId: MEMBERSHIP_ID,
        permissions: resolveCompanyPermissions(['helper']),
        roles: ['helper'],
        userId: '00000000-0000-4000-8000-000000000005',
      },
    },
    correlationId: 'c-1',
    pathParameters: {},
    request: new Request(`http://localhost${CURRENT_TRIP_PATH}`),
  })
  const body = (await response.json()) as { data: { trips: Record<string, unknown>[] } }
  return body.data.trips
}

describe('a resposta do motorista diz o papel na tripulação, por viagem (spec 243 D3)', () => {
  it('o ajudante recebe crewRole helper na viagem que acompanha', async () => {
    const [trip] = await readSerializedTrips([HELPING_TRIP])

    expect(trip?.crewRole).toBe('helper')
  })

  it('o motorista recebe crewRole driver na viagem que dirige', async () => {
    const [trip] = await readSerializedTrips([DRIVING_TRIP])

    expect(trip?.crewRole).toBe('driver')
  })

  it('a mesma pessoa é driver numa viagem e helper na outra', async () => {
    const trips = await readSerializedTrips([DRIVING_TRIP, HELPING_TRIP])

    expect(trips.map((trip) => [trip.id, trip.crewRole])).toEqual([
      ['trip-driving', 'driver'],
      ['trip-helping', 'helper'],
    ])
  })

  it('o caso de uso repassa o papel de cada viagem como o repositório o leu', async () => {
    const result = await findCurrentDriverTrip({
      companyId: COMPANY_ID,
      membershipId: MEMBERSHIP_ID,
      now: NOW,
      repository: {
        findDriverIdByMembership: async () => DRIVER_ID,
        listActiveTrips: async () => [DRIVING_TRIP, HELPING_TRIP],
        listPendingProofs: async () => [],
      },
      scores: { readScores: async () => new Map<string, number | null>() },
    })

    expect(result.trips.map((trip) => trip.crewRole)).toEqual(['driver', 'helper'])
  })
})
