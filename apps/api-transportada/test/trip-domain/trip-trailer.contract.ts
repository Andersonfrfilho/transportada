/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { TRIP_STATUSES, type TripStatus } from '../../src/database/trip.schema.js'
import { checkTripAcceptsTrailer } from '../../src/trips/domain/trip-trailer.policy.js'
import { TRIP_TRANSITION_BLOCK } from '../../src/trips/domain/trip-state.policy.js'

const TRAILER_ID = '00000000-0000-4000-8000-000000000916'

describe('trip trailer policy contract', () => {
  test('same value is always unchanged, even on a closed trip', () => {
    for (const tripStatus of TRIP_STATUSES) {
      for (const currentTrailerVehicleId of [null, TRAILER_ID]) {
        expect(
          checkTripAcceptsTrailer({
            currentTrailerVehicleId,
            nextTrailerVehicleId: currentTrailerVehicleId,
            tractionVehicleType: 'tractor_unit',
            tripStatus,
          }),
        ).toEqual({ outcome: 'unchanged' })
      }
    }
  })

  test('answers every cell of the tripStatus × tractionVehicleType grid for a new trailer', () => {
    let cells = 0
    for (const tripStatus of TRIP_STATUSES) {
      for (const tractionVehicleType of ['tractor_unit', 'truck', ''] as const) {
        const outcome = checkTripAcceptsTrailer({
          currentTrailerVehicleId: null,
          nextTrailerVehicleId: TRAILER_ID,
          tractionVehicleType,
          tripStatus,
        })
        expect(['allowed', 'blocked', 'requiresTractor']).toContain(outcome.outcome)
        if (outcome.outcome === 'blocked') {
          expect(Object.values(TRIP_TRANSITION_BLOCK)).toContain(outcome.reason)
        }
        cells += 1
      }
    }
    expect(cells).toBe(TRIP_STATUSES.length * 3)
  })

  test('the state gate comes before the tractor-only rule', () => {
    const dispatchedNonTractor = checkTripAcceptsTrailer({
      currentTrailerVehicleId: null,
      nextTrailerVehicleId: TRAILER_ID,
      tractionVehicleType: 'truck',
      tripStatus: 'dispatched',
    })
    expect(dispatchedNonTractor).toEqual({
      outcome: 'blocked',
      reason: TRIP_TRANSITION_BLOCK.tripAlreadyDispatched,
    })
  })

  test('a tractor unit before dispatch is allowed to receive a trailer', () => {
    for (const tripStatus of ['draft', 'route_planned', 'separating', 'loading'] as TripStatus[]) {
      expect(
        checkTripAcceptsTrailer({
          currentTrailerVehicleId: null,
          nextTrailerVehicleId: TRAILER_ID,
          tractionVehicleType: 'tractor_unit',
          tripStatus,
        }),
      ).toEqual({ outcome: 'allowed' })
    }
  })

  test('clearing the trailer does not require a tractor — only the state gate applies', () => {
    expect(
      checkTripAcceptsTrailer({
        currentTrailerVehicleId: TRAILER_ID,
        nextTrailerVehicleId: null,
        tractionVehicleType: 'truck',
        tripStatus: 'draft',
      }),
    ).toEqual({ outcome: 'allowed' })
  })
})
