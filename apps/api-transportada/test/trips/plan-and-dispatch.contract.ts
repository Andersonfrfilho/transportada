/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { dispatchTrip } from '../../src/trips/application/dispatch-trip.use-case.js'
import type {
  DispatchTripPort,
  DispatchTripPreconditions,
  DispatchTripWriteInput,
  DispatchTripWriteResult,
} from '../../src/trips/application/dispatch-trip.use-case.js'
import { planTripRoute } from '../../src/trips/application/plan-trip-route.use-case.js'
import type { PlanTripRoutePort, TripRouteState } from '../../src/trips/application/plan-trip-route.use-case.js'
import {
  TripDispatchForceReasonRequiredError,
  TripHasUnloadedDocumentsError,
  TripNotFoundError,
  TripStateTransitionNotAllowedError,
} from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const TRIP_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_USER_ID = '33333333-3333-4333-8333-333333333333'
const UNLOADED_ID = '44444444-4444-4444-8444-444444444444'

function createPlanFakePort(overrides: {
  readonly exists?: boolean
  readonly hasRoute?: boolean
  readonly tripStatus?: TripRouteState['tripStatus']
} = {}): PlanTripRoutePort & { readonly markRoutePlannedCalls: number } {
  const exists = overrides.exists ?? true
  const hasRoute = overrides.hasRoute ?? true
  const tripStatus = overrides.tripStatus ?? 'draft'
  let markRoutePlannedCalls = 0

  return {
    get markRoutePlannedCalls() {
      return markRoutePlannedCalls
    },
    async readRouteState() {
      if (!exists) return null
      return { hasRoute, tripStatus }
    },
    async markRoutePlanned() {
      markRoutePlannedCalls += 1
      return 'route_planned'
    },
  }
}

function createDispatchFakePort(overrides: {
  readonly exists?: boolean
  readonly hasRoute?: boolean
  readonly tripStatus?: DispatchTripPreconditions['tripStatus']
  readonly unloadedDocumentIds?: readonly string[]
} = {}): DispatchTripPort & { readonly dispatchCalls: DispatchTripWriteInput[] } {
  const exists = overrides.exists ?? true
  const hasRoute = overrides.hasRoute ?? true
  const tripStatus = overrides.tripStatus ?? 'loading'
  const unloadedDocumentIds = overrides.unloadedDocumentIds ?? []
  const dispatchCalls: DispatchTripWriteInput[] = []

  return {
    get dispatchCalls() {
      return dispatchCalls
    },
    async readPreconditions() {
      if (!exists) return null
      return { hasRoute, tripStatus, unloadedDocumentIds }
    },
    async dispatch(input): Promise<DispatchTripWriteResult> {
      dispatchCalls.push(input)
      return { tripStatus: 'dispatched' }
    },
  }
}

describe('plan trip route (spec 056 T010)', () => {
  test('plans the route once, from draft', async () => {
    const repository = createPlanFakePort({ hasRoute: true, tripStatus: 'draft' })

    const result = await planTripRoute({ companyId: COMPANY_ID, repository, tripId: TRIP_ID })

    expect(result.tripStatus).toBe('route_planned')
    expect(repository.markRoutePlannedCalls).toBe(1)
  })

  test('refuses to plan without a route, with the reason the T006 already names', async () => {
    const repository = createPlanFakePort({ hasRoute: false, tripStatus: 'draft' })

    const error = await planTripRoute({ companyId: COMPANY_ID, repository, tripId: TRIP_ID }).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(TripStateTransitionNotAllowedError)
    expect((error as TripStateTransitionNotAllowedError).reason).toBe('TRIP_HAS_NO_ROUTE')
    expect(repository.markRoutePlannedCalls).toBe(0)
  })

  test('is idempotent: planning an already-planned trip writes nothing', async () => {
    const repository = createPlanFakePort({ hasRoute: true, tripStatus: 'separating' })

    const result = await planTripRoute({ companyId: COMPANY_ID, repository, tripId: TRIP_ID })

    expect(result.tripStatus).toBe('separating')
    expect(repository.markRoutePlannedCalls).toBe(0)
  })

  test('never re-opens a dispatched trip for planning', async () => {
    const repository = createPlanFakePort({ hasRoute: true, tripStatus: 'dispatched' })

    const error = await planTripRoute({ companyId: COMPANY_ID, repository, tripId: TRIP_ID }).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(TripStateTransitionNotAllowedError)
    expect(repository.markRoutePlannedCalls).toBe(0)
  })

  test('throws not found for a trip outside this company', async () => {
    const repository = createPlanFakePort({ exists: false })

    const error = await planTripRoute({ companyId: COMPANY_ID, repository, tripId: TRIP_ID }).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(TripNotFoundError)
  })
})

describe('dispatch trip (spec 056 T010, ADR-0043 §2)', () => {
  test('dispatches a fully loaded trip, unforced', async () => {
    const repository = createDispatchFakePort({ tripStatus: 'loading', unloadedDocumentIds: [] })

    const result = await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    })

    expect(result.tripStatus).toBe('dispatched')
    expect(repository.dispatchCalls).toEqual([
      {
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        forceReason: null,
        forced: false,
        tripId: TRIP_ID,
        unloadedDocumentIds: [],
      },
    ])
  })

  test('refuses to dispatch without a route', async () => {
    const repository = createDispatchFakePort({ hasRoute: false, tripStatus: 'draft' })

    const error = await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripStateTransitionNotAllowedError)
    expect(repository.dispatchCalls).toHaveLength(0)
  })

  test('refuses by default with an unloaded document, and lists it', async () => {
    const repository = createDispatchFakePort({ unloadedDocumentIds: [UNLOADED_ID] })

    const error = await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripHasUnloadedDocumentsError)
    expect((error as TripHasUnloadedDocumentsError).documentIds).toEqual([UNLOADED_ID])
    expect(repository.dispatchCalls).toHaveLength(0)
  })

  test('refuses force without a reason', async () => {
    const repository = createDispatchFakePort({ unloadedDocumentIds: [UNLOADED_ID] })

    const error = await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      force: true,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripDispatchForceReasonRequiredError)
    expect(repository.dispatchCalls).toHaveLength(0)
  })

  test('dispatches with force and a reason, and marks it as forced only because it was needed', async () => {
    const repository = createDispatchFakePort({ unloadedDocumentIds: [UNLOADED_ID] })

    await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      force: true,
      forceReason: 'Cliente pediu para não esperar a última nota',
      repository,
      tripId: TRIP_ID,
    })

    expect(repository.dispatchCalls).toEqual([
      {
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        forceReason: 'Cliente pediu para não esperar a última nota',
        forced: true,
        tripId: TRIP_ID,
        unloadedDocumentIds: [UNLOADED_ID],
      },
    ])
  })

  test('never marks forced when there was nothing to force, even if the caller passed force:true', async () => {
    const repository = createDispatchFakePort({ unloadedDocumentIds: [] })

    await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      force: true,
      forceReason: 'não deveria nem ser lido',
      repository,
      tripId: TRIP_ID,
    })

    expect(repository.dispatchCalls[0]).toMatchObject({ forceReason: null, forced: false })
  })

  test('is idempotent: dispatching an already-dispatched trip writes nothing', async () => {
    const repository = createDispatchFakePort({ tripStatus: 'dispatched' })

    const result = await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    })

    expect(result.tripStatus).toBe('dispatched')
    expect(repository.dispatchCalls).toHaveLength(0)
  })

  test('throws not found for a trip outside this company', async () => {
    const repository = createDispatchFakePort({ exists: false })

    const error = await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripNotFoundError)
  })
})
