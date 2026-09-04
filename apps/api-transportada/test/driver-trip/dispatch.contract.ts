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
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'

function buildWorld(input: { readonly isLinked: boolean }) {
  const dispatched: Array<{ readonly actorUserId: string; readonly tripId: string }> = []

  return {
    dispatch: (request: { readonly actorUserId: string; readonly tripId: string }) => {
      dispatched.push(request)
      return Promise.resolve({ tripStatus: 'dispatched' as const })
    },
    dispatched,
    linkage: {
      isTripOfDriver: () => Promise.resolve(input.isLinked),
    },
  }
}

describe('o dispatch pelo motorista (ADR-0058)', () => {
  it('viagem de outro vínculo é 403, e a transição nem é tentada', async () => {
    const world = buildWorld({ isLinked: false })

    try {
      await dispatchDriverTrip({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        dispatch: world.dispatch,
        driverId: DRIVER_ID,
        linkage: world.linkage,
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

  it('viagem do próprio vínculo passa pela mesma transição do escritório, sem force', async () => {
    const world = buildWorld({ isLinked: true })

    const result = await dispatchDriverTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      dispatch: world.dispatch,
      driverId: DRIVER_ID,
      linkage: world.linkage,
      tripId: TRIP_ID,
    })

    expect(result).toEqual({ tripStatus: 'dispatched' })
    expect(world.dispatched).toEqual([{ actorUserId: ACTOR_USER_ID, tripId: TRIP_ID }])
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
          tripStatus,
          unloadedDocumentIds: [],
          unscheduledStopIds: [],
        }),
    }
    const input = {
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      dispatch: (request: { readonly actorUserId: string; readonly tripId: string }) =>
        dispatchTrip({ ...request, companyId: COMPANY_ID, repository }),
      linkage: { isTripOfDriver: () => Promise.resolve(true) },
      tripId: TRIP_ID,
    }

    const first = await dispatchDriverTrip(input)
    const second = await dispatchDriverTrip(input)

    expect(first).toEqual({ tripStatus: 'dispatched' })
    expect(second).toEqual({ tripStatus: 'dispatched' })
    expect(snapshots).toHaveLength(1)
  })
})
