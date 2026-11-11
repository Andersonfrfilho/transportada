/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323 T5: o ordenador do rascunho como caso de uso, com portas falsas. A matriz falsa é a distância na reta de
 * longitude — só para o teste ter uma resposta conhecida; o código de produção nunca calcula distância.
 */
import { describe, expect, test } from 'bun:test'

import type {
  DraftStopCoordinate,
  DraftStopOrderingState,
  OrderDraftTripStopsPort,
} from '../../src/trips/application/order-draft-trip-stops.port.js'
import { orderDraftTripStopsGracefully } from '../../src/trips/application/order-draft-trip-stops-gracefully.js'
import { createOrderDraftTripStops } from '../../src/trips/application/order-draft-trip-stops.use-case.js'
import type { ReorderTripStopsPort } from '../../src/trips/application/reorder-trip-stops.use-case.js'
import type { RoadMatrixPort } from '../../src/trips/application/road-matrix.port.js'
import type { RouteDepot } from '../../src/trips/domain/route-depot.policy.js'
import { DRAFT_STOP_ORDER_MAX_STOPS } from '../../src/trips/domain/draft-stop-order.constant.js'
import { TripStateTransitionNotAllowedError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const TRIP_ID = '22222222-2222-4222-8222-222222222222'

/** Longitude por cidade: Matão, Monte Alto e Jaboticabal ficam na ordem da estrada, e o bip as intercala. */
const LONGITUDE_BY_KEY: Readonly<Record<string, number>> = {
  jaboticabal: 3,
  matao: 1,
  'monte-alto': 2,
}

function stop(id: string, addressKey: string, sequence: number) {
  return { addressKey, id, sequence }
}

type Calls = { reorder: unknown[]; recorded: unknown[]; matrixPoints: unknown[] }

function build(input: {
  readonly coordinates?: ReadonlyMap<string, DraftStopCoordinate>
  readonly depot?: RouteDepot
  readonly matrixFails?: boolean
  readonly state: DraftStopOrderingState | null
}) {
  const calls: Calls = { matrixPoints: [], recorded: [], reorder: [] }
  const coordinates =
    input.coordinates ??
    new Map<string, DraftStopCoordinate>(
      Object.entries(LONGITUDE_BY_KEY).map(([key, longitude]) => [
        key,
        { latitude: 0, longitude, precision: 'street' },
      ]),
    )
  const repository: OrderDraftTripStopsPort = {
    async readOrderingState() {
      return input.state
    },
    async readStopCoordinates() {
      return coordinates
    },
    async recordStopOrder(call) {
      calls.recorded.push(call)
    },
  }
  const matrix: RoadMatrixPort = {
    async readMatrix(points) {
      calls.matrixPoints.push(points)
      if (input.matrixFails === true) return null
      const costs = points.map((from) =>
        points.map((to) => Math.abs(from.longitude - to.longitude)),
      )
      return { distancesMetres: costs, durationsSeconds: costs }
    },
  }
  const reorder: ReorderTripStopsPort = {
    async readStopOrderPreconditions() {
      return {
        stopIds: input.state?.stops.map((item) => item.id) ?? [],
        tripStatus: input.state?.tripStatus ?? 'draft',
      }
    },
    async reorderStops(call) {
      calls.reorder.push(call)
    },
  }
  const depot = {
    async readDepot(): Promise<RouteDepot> {
      return input.depot ?? { end: null, origin: { latitude: 0, longitude: 0 }, status: 'resolved' }
    },
  }
  const orderer = createOrderDraftTripStops({ depot, matrix, reorder, repository })
  return { calls, orderer }
}

const INTERLEAVED: DraftStopOrderingState = {
  stopOrderSource: 'unordered',
  stops: [stop('s1', 'jaboticabal', 1), stop('s2', 'matao', 2), stop('s3', 'monte-alto', 3)],
  tripStatus: 'draft',
}

describe('draft trip stop ordering (spec 323)', () => {
  test('orders bipped-in-any-order stops by the road and records them as suggested', async () => {
    const { calls, orderer } = build({ state: INTERLEAVED })

    const outcome = await orderer.execute({ companyId: COMPANY_ID, tripId: TRIP_ID })

    expect(outcome).toEqual({ errorCode: null, excludedStopCount: 0, status: 'ordered' })
    expect(calls.reorder).toEqual([
      {
        companyId: COMPANY_ID,
        orderedStopIds: ['s2', 's3', 's1'],
        source: 'suggested',
        tripId: TRIP_ID,
      },
    ])
  })

  test('leaves the stops alone when they are already in road order', async () => {
    const { calls, orderer } = build({
      state: {
        ...INTERLEAVED,
        stops: [stop('s2', 'matao', 1), stop('s3', 'monte-alto', 2), stop('s1', 'jaboticabal', 3)],
      },
    })

    const outcome = await orderer.execute({ companyId: COMPANY_ID, tripId: TRIP_ID })

    expect(outcome.status).toBe('unchanged')
    expect(calls.reorder).toEqual([])
    expect(calls.recorded).toEqual([
      { companyId: COMPANY_ID, errorCode: null, source: 'suggested', tripId: TRIP_ID },
    ])
  })

  test('OSRM down: keeps the arrival order, records the stable code and never falls back to a straight line', async () => {
    const { calls, orderer } = build({ matrixFails: true, state: INTERLEAVED })

    const outcome = await orderer.execute({ companyId: COMPANY_ID, tripId: TRIP_ID })

    expect(outcome).toEqual({
      errorCode: 'ROUTING_MATRIX_UNAVAILABLE',
      excludedStopCount: 0,
      status: 'unordered',
    })
    expect(calls.reorder).toEqual([])
    expect(calls.recorded).toEqual([
      {
        companyId: COMPANY_ID,
        errorCode: 'ROUTING_MATRIX_UNAVAILABLE',
        source: 'unordered',
        tripId: TRIP_ID,
      },
    ])
  })

  test('a manual order survives an OSRM failure: only the code is recorded', async () => {
    const { calls, orderer } = build({
      matrixFails: true,
      state: { ...INTERLEAVED, stopOrderSource: 'manual' },
    })

    await orderer.execute({
      companyId: COMPANY_ID,
      knownStopIds: new Set(['s1', 's2']),
      tripId: TRIP_ID,
    })

    expect(calls.recorded).toEqual([
      {
        companyId: COMPANY_ID,
        errorCode: 'ROUTING_MATRIX_UNAVAILABLE',
        source: 'manual',
        tripId: TRIP_ID,
      },
    ])
  })

  test('manual order + new stop: only the new stop moves, the dispatcher order of the others is kept', async () => {
    const { calls, orderer } = build({
      state: {
        stopOrderSource: 'manual',
        stops: [stop('s2', 'matao', 1), stop('s1', 'jaboticabal', 2), stop('s3', 'monte-alto', 3)],
        tripStatus: 'draft',
      },
    })

    const outcome = await orderer.execute({
      companyId: COMPANY_ID,
      knownStopIds: new Set(['s1', 's2']),
      tripId: TRIP_ID,
    })

    expect(outcome.status).toBe('ordered')
    expect(calls.reorder).toEqual([
      {
        companyId: COMPANY_ID,
        orderedStopIds: ['s2', 's3', 's1'],
        source: 'manual',
        tripId: TRIP_ID,
      },
    ])
  })

  test('manual order and no new stop: nothing to do', async () => {
    const { calls, orderer } = build({ state: { ...INTERLEAVED, stopOrderSource: 'manual' } })

    const outcome = await orderer.execute({
      companyId: COMPANY_ID,
      knownStopIds: new Set(['s1', 's2', 's3']),
      tripId: TRIP_ID,
    })

    expect(outcome.status).toBe('skipped')
    expect(calls.matrixPoints).toEqual([])
  })

  test('the Ordenar paradas button redoes even a manual order', async () => {
    const { calls, orderer } = build({ state: { ...INTERLEAVED, stopOrderSource: 'manual' } })

    await orderer.execute({ companyId: COMPANY_ID, intent: 'reorder_all', tripId: TRIP_ID })

    expect(calls.reorder).toEqual([
      expect.objectContaining({ orderedStopIds: ['s2', 's3', 's1'], source: 'suggested' }),
    ])
  })

  test('stops without a reliable coordinate go to the end and are counted', async () => {
    const coordinates = new Map<string, DraftStopCoordinate>([
      ['jaboticabal', { latitude: 0, longitude: 3, precision: 'street' }],
      ['matao', { latitude: 0, longitude: 1, precision: 'city' }],
    ])
    const { calls, orderer } = build({
      coordinates,
      state: {
        ...INTERLEAVED,
        stops: [stop('s2', 'matao', 1), stop('s1', 'jaboticabal', 2), stop('s3', 'monte-alto', 3)],
      },
    })

    const outcome = await orderer.execute({ companyId: COMPANY_ID, tripId: TRIP_ID })

    expect(outcome.excludedStopCount).toBe(2)
    expect(calls.reorder).toEqual([expect.objectContaining({ orderedStopIds: ['s1', 's2', 's3'] })])
  })

  test('refuses to ask for a matrix above the stop limit', async () => {
    const stops = Array.from({ length: DRAFT_STOP_ORDER_MAX_STOPS + 1 }, (_, index) =>
      stop(`s${String(index)}`, 'matao', index + 1),
    )
    const { calls, orderer } = build({
      state: { stopOrderSource: 'unordered', stops, tripStatus: 'draft' },
    })

    const outcome = await orderer.execute({ companyId: COMPANY_ID, tripId: TRIP_ID })

    expect(outcome.errorCode).toBe('ROUTING_TOO_MANY_STOPS')
    expect(calls.matrixPoints).toEqual([])
  })

  test('a depot that is not geocoded is a failure, not a guess', async () => {
    const { calls, orderer } = build({
      depot: { reason: 'not_geocoded', status: 'absent' },
      state: INTERLEAVED,
    })

    const outcome = await orderer.execute({ companyId: COMPANY_ID, tripId: TRIP_ID })

    expect(outcome.errorCode).toBe('ROUTING_DEPOT_NOT_GEOCODED')
    expect(calls.matrixPoints).toEqual([])
  })

  test('a dispatched trip is untouched by the link and refused (409) by the button', async () => {
    const { calls, orderer } = build({ state: { ...INTERLEAVED, tripStatus: 'dispatched' } })

    expect((await orderer.execute({ companyId: COMPANY_ID, tripId: TRIP_ID })).status).toBe(
      'skipped',
    )
    await expect(
      orderer.execute({ companyId: COMPANY_ID, strict: true, tripId: TRIP_ID }),
    ).rejects.toBeInstanceOf(TripStateTransitionNotAllowedError)
    expect(calls.reorder).toEqual([])
    expect(calls.recorded).toEqual([])
  })

  test('the graceful wrapper never throws and logs only identifiers', async () => {
    const warnings: unknown[] = []
    await orderDraftTripStopsGracefully({
      companyId: COMPANY_ID,
      knownStopIds: undefined,
      logger: { warn: (message, metadata) => warnings.push({ message, metadata }) },
      orderer: {
        async execute() {
          throw new Error('boom at 10.0,20.0')
        },
        async snapshotStopIds() {
          return new Set()
        },
      },
      tripId: TRIP_ID,
    })

    expect(warnings).toEqual([
      {
        message: 'trip_stop_order_failed',
        metadata: { errorName: 'Error', phase: 'order', tripId: TRIP_ID },
      },
    ])
  })
})
