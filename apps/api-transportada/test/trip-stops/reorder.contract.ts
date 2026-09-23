/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  reorderTripStops,
  type ReorderTripStopsPort,
} from '../../src/trips/application/reorder-trip-stops.use-case.js'
import type { PlanTripRouteTollFreezer } from '../../src/trips/application/plan-trip-route.use-case.js'
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const TRIP_ID = '22222222-2222-4222-8222-222222222222'
const STOP_A = '33333333-3333-4333-8333-333333333333'
const STOP_B = '44444444-4444-4444-8444-444444444444'
const STOP_C = '55555555-5555-4555-8555-555555555555'
const OTHER_STOP = '66666666-6666-4666-8666-666666666666'

function createFakePort(input: {
  readonly stopIds: readonly string[]
  readonly tripExists?: boolean
  readonly tripStatus?: 'draft' | 'dispatched' | 'completed' | 'cancelled'
}): ReorderTripStopsPort & { readonly reorderCalls: unknown[] } {
  const reorderCalls: unknown[] = []
  return {
    reorderCalls,
    async readStopOrderPreconditions() {
      if (input.tripExists === false) return null
      return { stopIds: input.stopIds, tripStatus: input.tripStatus ?? 'draft' }
    },
    async reorderStops(call) {
      reorderCalls.push(call)
    },
  }
}

describe('trip stop reorder contract', () => {
  test('writes the new order when the trip is open and the set matches exactly', async () => {
    const repository = createFakePort({ stopIds: [STOP_A, STOP_B, STOP_C] })

    const result = await reorderTripStops({
      companyId: COMPANY_ID,
      orderedStopIds: [STOP_C, STOP_A, STOP_B],
      repository,
      tripId: TRIP_ID,
    })

    expect(result).toEqual({ tripStatus: 'draft' })
    expect(repository.reorderCalls).toEqual([
      { companyId: COMPANY_ID, orderedStopIds: [STOP_C, STOP_A, STOP_B], tripId: TRIP_ID },
    ])
  })

  test('refuses when the trip does not exist in this company', async () => {
    const repository = createFakePort({ stopIds: [STOP_A], tripExists: false })

    const error = await reorderTripStops({
      companyId: COMPANY_ID,
      orderedStopIds: [STOP_A],
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('TRIP_NOT_FOUND')
    expect(repository.reorderCalls).toEqual([])
  })

  test.each(['dispatched', 'completed', 'cancelled'] as const)(
    'refuses to reorder once the trip is %s',
    async (tripStatus) => {
      const repository = createFakePort({ stopIds: [STOP_A, STOP_B], tripStatus })

      const error = await reorderTripStops({
        companyId: COMPANY_ID,
        orderedStopIds: [STOP_B, STOP_A],
        repository,
        tripId: TRIP_ID,
      }).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).code).toBe('STATE_TRANSITION_NOT_ALLOWED')
      expect((error as ApiError).status).toBe(409)
      expect(repository.reorderCalls).toEqual([])
    },
  )

  test('refuses when a stop is missing from the request', async () => {
    const repository = createFakePort({ stopIds: [STOP_A, STOP_B, STOP_C] })

    const error = await reorderTripStops({
      companyId: COMPANY_ID,
      orderedStopIds: [STOP_A, STOP_B],
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect((error as ApiError).code).toBe('TRIP_STOP_SET_MISMATCH')
    expect((error as ApiError).status).toBe(422)
    expect(repository.reorderCalls).toEqual([])
  })

  test('refuses when the request includes a stop from another trip', async () => {
    const repository = createFakePort({ stopIds: [STOP_A, STOP_B] })

    const error = await reorderTripStops({
      companyId: COMPANY_ID,
      orderedStopIds: [STOP_A, STOP_B, OTHER_STOP],
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect((error as ApiError).code).toBe('TRIP_STOP_SET_MISMATCH')
    expect(repository.reorderCalls).toEqual([])
  })

  test('refuses a duplicated stop id even if the set would otherwise match', async () => {
    const repository = createFakePort({ stopIds: [STOP_A, STOP_B] })

    const error = await reorderTripStops({
      companyId: COMPANY_ID,
      orderedStopIds: [STOP_A, STOP_A],
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect((error as ApiError).code).toBe('TRIP_STOP_SET_MISMATCH')
    expect(repository.reorderCalls).toEqual([])
  })
})

/** D6: mudar a ordem das paradas invalida a rota gravada — recalcula com `cheapest`, D5 valendo. */
describe('trip stop reorder route recalculation (D6)', () => {
  function createFreezer(
    options: { readonly shouldFail?: boolean } = {},
  ): PlanTripRouteTollFreezer & { readonly freezeCalls: unknown[] } {
    const freezeCalls: unknown[] = []
    return {
      freezeCalls,
      async freeze(input) {
        freezeCalls.push(input)
        if (options.shouldFail === true) throw new Error('OSRM indisponível')
      return { routeFrozen: true }
      },
    }
  }

  test('recalculates the route with cheapest after the stops are reordered', async () => {
    const repository = createFakePort({ stopIds: [STOP_A, STOP_B, STOP_C] })
    const routeFreezer = createFreezer()

    await reorderTripStops({
      companyId: COMPANY_ID,
      orderedStopIds: [STOP_C, STOP_A, STOP_B],
      repository,
      routeFreezer,
      tripId: TRIP_ID,
    })

    /** Sem `routeChoice`: o congelador cai no default `cheapest` (D6), nunca reafirma a escolha antiga. */
    expect(routeFreezer.freezeCalls).toEqual([{ companyId: COMPANY_ID, tripId: TRIP_ID }])
  })

  test('still reorders the stops when the route freezer fails (D5, OSRM fora do ar)', async () => {
    const repository = createFakePort({ stopIds: [STOP_A, STOP_B] })
    const routeFreezer = createFreezer({ shouldFail: true })

    const result = await reorderTripStops({
      companyId: COMPANY_ID,
      orderedStopIds: [STOP_B, STOP_A],
      repository,
      routeFreezer,
      tripId: TRIP_ID,
    })

    expect(result).toEqual({ tripStatus: 'draft' })
    expect(repository.reorderCalls).toEqual([
      { companyId: COMPANY_ID, orderedStopIds: [STOP_B, STOP_A], tripId: TRIP_ID },
    ])
  })

  test('does not recalculate the route when no route freezer is configured', async () => {
    const repository = createFakePort({ stopIds: [STOP_A, STOP_B] })

    const result = await reorderTripStops({
      companyId: COMPANY_ID,
      orderedStopIds: [STOP_B, STOP_A],
      repository,
      tripId: TRIP_ID,
    })

    expect(result).toEqual({ tripStatus: 'draft' })
  })
})
