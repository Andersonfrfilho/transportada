/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 082 D9 / ADR-0058: o motorista vinculado despacha a própria viagem. A máquina não muda —
 * este contrato prova o recorte pelo vínculo e o repasse à mesma transição do escritório.
 */
import { describe, expect, it } from 'bun:test'

import { dispatchDriverTrip } from '../../src/trips/application/dispatch-driver-trip.use-case.js'
import {
  dispatchTrip,
  type DispatchTripPort,
} from '../../src/trips/application/dispatch-trip.use-case.js'
import { NO_EVENT_LOCATION_STAMP } from '../../src/trips/domain/event-location-stamp.policy.js'
import type { EventLocationStampColumns } from '../../src/trips/domain/event-location-stamp.types.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'

function buildWorld(input: { readonly role: 'driver' | 'helper' | null }) {
  const dispatched: Array<{
    readonly actorUserId: string
    readonly locationStamp: EventLocationStampColumns
    readonly tripId: string
  }> = []

  return {
    dispatch: (request: {
      readonly actorUserId: string
      readonly locationStamp: EventLocationStampColumns
      readonly tripId: string
    }) => {
      dispatched.push(request)
      return Promise.resolve({ tripStatus: 'dispatched' as const })
    },
    dispatched,
    linkage: {
      findCrewRole: () => Promise.resolve(input.role),
    },
  }
}

describe('o dispatch pelo motorista (ADR-0058)', () => {
  it('viagem de outro vínculo é 403, e a transição nem é tentada', async () => {
    const world = buildWorld({ role: null })

    try {
      await dispatchDriverTrip({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        dispatch: world.dispatch,
        driverId: DRIVER_ID,
        linkage: world.linkage,
        location: null,
        tripId: TRIP_ID,
      })
      throw new Error('EXPECTED_API_ERROR')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).code).toBe('TRIP_NOT_OF_DRIVER')
      expect((error as ApiError).status).toBe(403)
    }
    expect(world.dispatched).toHaveLength(0)
  })

  // Spec 149 (ADR-0065): o ajudante tem a linha em `trip_drivers`, mas não o papel — 403 também.
  it('ajudante da mesma tripulação não despacha', async () => {
    const world = buildWorld({ role: 'helper' })

    const error = await dispatchDriverTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      dispatch: world.dispatch,
      driverId: DRIVER_ID,
      linkage: world.linkage,
      location: null,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('TRIP_CREW_HELPER_CANNOT_DRIVE')
    expect((error as ApiError).status).toBe(403)
    expect(world.dispatched).toHaveLength(0)
  })

  it('viagem do próprio vínculo passa pela mesma transição do escritório, sem force', async () => {
    const world = buildWorld({ role: 'driver' })

    const result = await dispatchDriverTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      dispatch: world.dispatch,
      driverId: DRIVER_ID,
      linkage: world.linkage,
      location: null,
      tripId: TRIP_ID,
    })

    expect(result).toEqual({ tripStatus: 'dispatched' })
    expect(world.dispatched).toEqual([
      {
        actorUserId: ACTOR_USER_ID,
        locationStamp: { ...NO_EVENT_LOCATION_STAMP, locationState: 'unavailable' },
        tripId: TRIP_ID,
      },
    ])
  })

  /**
   * Revisão da spec 082, item 2: o POST repetido converge em `unchanged` — nenhum segundo
   * congelamento de roteiro, e a resposta é o mesmo marcador que o use-case do escritório devolve.
   */
  it('dispatch repetido converge sem segundo snapshot', async () => {
    let tripStatus: 'route_planned' | 'dispatched' = 'route_planned'
    const snapshots: string[] = []
    const repository: DispatchTripPort = {
      dispatch: (request) => {
        snapshots.push(request.tripId)
        tripStatus = 'dispatched'
        return Promise.resolve({ tripStatus })
      },
      readPreconditions: () =>
        Promise.resolve({
          hasRoute: true,
          isCargoClosed: true,
          leftBehind: [],
          toLoad: [],
          requiresTrailer: false,
          tripStatus,
          unloadedDocumentIds: [],
          unscheduledStopIds: [],
        }),
    }
    const input = {
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      dispatch: (request: {
        readonly actorUserId: string
        readonly locationStamp: EventLocationStampColumns
        readonly tripId: string
      }) =>
        dispatchTrip({
          ...request,
          channel: TRIP_FIELD_CHANNELS.driverApp,
          companyId: COMPANY_ID,
          repository,
        }),
      linkage: { findCrewRole: () => Promise.resolve('driver' as const) },
      location: null,
      tripId: TRIP_ID,
    }

    const first = await dispatchDriverTrip(input)
    const second = await dispatchDriverTrip(input)

    expect(first).toEqual({ tripStatus: 'dispatched' })
    expect(second).toEqual({ tripStatus: 'dispatched' })
    expect(snapshots).toHaveLength(1)
  })
})
