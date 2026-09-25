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
import type {
  PlanTripRoutePort,
  TripRouteState,
} from '../../src/trips/application/plan-trip-route.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { parseDispatchTripRequest } from '../../src/trips/presentation/trip.schema.js'
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
const UNSCHEDULED_STOP_ID = '55555555-5555-4555-8555-555555555555'
const SEPARATED_ID = '66666666-6666-4666-8666-666666666666'
const LEFT_BEHIND_ID = '77777777-7777-4777-8777-777777777777'

function createPlanFakePort(
  overrides: {
    readonly exists?: boolean
    readonly hasRoute?: boolean
    readonly tripStatus?: TripRouteState['tripStatus']
  } = {},
): PlanTripRoutePort & { readonly markRoutePlannedCalls: number } {
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

function createDispatchFakePort(
  overrides: {
    readonly exists?: boolean
    readonly hasRoute?: boolean
    /** Spec 185: sem nota carregada, a carga não fecha — o padrão é ter ao menos uma. */
    readonly hasLoadedDocument?: boolean
    readonly leftBehind?: DispatchTripPreconditions['leftBehind']
    readonly toLoad?: DispatchTripPreconditions['toLoad']
    readonly tripStatus?: DispatchTripPreconditions['tripStatus']
    readonly unloadedDocumentIds?: readonly string[]
    readonly unscheduledStopIds?: readonly string[]
  } = {},
): DispatchTripPort & { readonly dispatchCalls: DispatchTripWriteInput[] } {
  const exists = overrides.exists ?? true
  const hasRoute = overrides.hasRoute ?? true
  const tripStatus = overrides.tripStatus ?? 'loading'
  const toLoad =
    overrides.toLoad ??
    (overrides.unloadedDocumentIds ?? []).map((tripDocumentId) => ({
      separationStatus: 'pending' as const,
      tripDocumentId,
    }))
  const unloadedDocumentIds = toLoad.map((document) => document.tripDocumentId)
  const leftBehind = overrides.leftBehind ?? []
  const isCargoClosed = toLoad.length === 0 && (overrides.hasLoadedDocument ?? true)
  const unscheduledStopIds = overrides.unscheduledStopIds ?? []
  const dispatchCalls: DispatchTripWriteInput[] = []

  return {
    get dispatchCalls() {
      return dispatchCalls
    },
    async readPreconditions() {
      if (!exists) return null
      return {
        hasRoute,
        isCargoClosed,
        leftBehind,
        toLoad,
        tripStatus,
        unloadedDocumentIds,
        unscheduledStopIds,
      }
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

    const result = await planTripRoute({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    })

    expect(result.tripStatus).toBe('route_planned')
    expect(repository.markRoutePlannedCalls).toBe(1)
  })

  test('refuses to plan without a route, with the reason the T006 already names', async () => {
    const repository = createPlanFakePort({ hasRoute: false, tripStatus: 'draft' })

    const error = await planTripRoute({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripStateTransitionNotAllowedError)
    expect((error as TripStateTransitionNotAllowedError).reason).toBe('TRIP_HAS_NO_ROUTE')
    expect(repository.markRoutePlannedCalls).toBe(0)
  })

  test('is idempotent: planning an already-planned trip writes nothing', async () => {
    const repository = createPlanFakePort({ hasRoute: true, tripStatus: 'separating' })

    const result = await planTripRoute({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    })

    expect(result.tripStatus).toBe('separating')
    expect(repository.markRoutePlannedCalls).toBe(0)
  })

  test('never re-opens a dispatched trip for planning', async () => {
    const repository = createPlanFakePort({ hasRoute: true, tripStatus: 'dispatched' })

    const error = await planTripRoute({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripStateTransitionNotAllowedError)
    expect(repository.markRoutePlannedCalls).toBe(0)
  })

  test('throws not found for a trip outside this company', async () => {
    const repository = createPlanFakePort({ exists: false })

    const error = await planTripRoute({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripNotFoundError)
  })
})

describe('dispatch trip (spec 056 T010, ADR-0043 §2)', () => {
  test('dispatches a fully loaded trip, unforced', async () => {
    const repository = createDispatchFakePort({ tripStatus: 'loading', unloadedDocumentIds: [] })

    const result = await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    })

    expect(result.tripStatus).toBe('dispatched')
    expect(repository.dispatchCalls).toEqual([
      {
        actorUserId: ACTOR_USER_ID,
        channel: TRIP_FIELD_CHANNELS.backoffice,
        companyId: COMPANY_ID,
        documentsToLoad: [],
        forceReason: null,
        forced: false,
        hasRoute: true,
        leftBehind: [],
        onBehalfOfDriverId: null,
        tripId: TRIP_ID,
        unloadedDocumentIds: [],
      },
    ])
  })

  test('refuses to dispatch without a route', async () => {
    const repository = createDispatchFakePort({ hasRoute: false, tripStatus: 'draft' })

    const error = await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
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
      channel: TRIP_FIELD_CHANNELS.backoffice,
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
      channel: TRIP_FIELD_CHANNELS.backoffice,
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
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      force: true,
      forceReason: 'Cliente pediu para não esperar a última nota',
      repository,
      tripId: TRIP_ID,
    })

    expect(repository.dispatchCalls).toEqual([
      {
        actorUserId: ACTOR_USER_ID,
        channel: TRIP_FIELD_CHANNELS.backoffice,
        companyId: COMPANY_ID,
        documentsToLoad: [],
        forceReason: 'Cliente pediu para não esperar a última nota',
        forced: true,
        hasRoute: true,
        leftBehind: [],
        onBehalfOfDriverId: null,
        tripId: TRIP_ID,
        unloadedDocumentIds: [UNLOADED_ID],
      },
    ])
  })

  test('never marks forced when there was nothing to force, even if the caller passed force:true', async () => {
    const repository = createDispatchFakePort({ unloadedDocumentIds: [] })

    await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
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
      channel: TRIP_FIELD_CHANNELS.backoffice,
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
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripNotFoundError)
  })

  /**
   * Spec 060 D3: o cliente que exige agendamento recusa a carga na portaria, e o caminhão volta
   * cheio. A recusa lista **as paradas**, porque é para o cliente daquela parada que se liga.
   */
  test('recusa despachar viagem com parada sem agendamento', async () => {
    const repository = createDispatchFakePort({ unscheduledStopIds: [UNSCHEDULED_STOP_ID] })

    const error = await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'TRIP_HAS_UNSCHEDULED_STOPS', status: 409 })
    expect(repository.dispatchCalls).toEqual([])
  })

  /** "Vou tentar assim mesmo" é decisão real da operação — o que não pode é acontecer sem assinatura. */
  test('aceita despachar sem agendamento com force e motivo, e recusa o force mudo', async () => {
    const forced = createDispatchFakePort({ unscheduledStopIds: [UNSCHEDULED_STOP_ID] })

    await expect(
      dispatchTrip({
        actorUserId: ACTOR_USER_ID,
        channel: TRIP_FIELD_CHANNELS.backoffice,
        companyId: COMPANY_ID,
        force: true,
        repository: forced,
        tripId: TRIP_ID,
      }),
    ).rejects.toMatchObject({ code: 'TRIP_DISPATCH_FORCE_REASON_REQUIRED' })

    const accepted = createDispatchFakePort({ unscheduledStopIds: [UNSCHEDULED_STOP_ID] })
    await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      force: true,
      forceReason: 'cliente autorizou por telefone',
      repository: accepted,
      tripId: TRIP_ID,
    })

    expect(accepted.dispatchCalls[0]).toMatchObject({
      forceReason: 'cliente autorizou por telefone',
      forced: true,
    })
  })

  /** A do agendamento vem primeiro: ela não se resolve no barracão, depende do cliente. */
  test('com as duas pendências, a recusa nomeia o agendamento', async () => {
    const repository = createDispatchFakePort({
      unloadedDocumentIds: [UNLOADED_ID],
      unscheduledStopIds: [UNSCHEDULED_STOP_ID],
    })

    const error = await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'TRIP_HAS_UNSCHEDULED_STOPS' })
  })
})

/**
 * Spec 185 T3.1 (CA04, CA05, ADR-0074 §3/§4): o botão "Despachar" leva todas (`loadRemaining`), e
 * a nota que a ocorrência deixa para trás sai sem `force`. `force` e `loadRemaining` são respostas
 * opostas à mesma pergunta — liberar ou carregar o que falta — e juntos são recusados.
 */
describe('despachar leva todas (spec 185 T3.1)', () => {
  test('loadRemaining com force é 400, e nada é escrito', async () => {
    const repository = createDispatchFakePort({ unloadedDocumentIds: [UNLOADED_ID] })

    const error = await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      force: true,
      forceReason: 'não pode',
      loadRemaining: true,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({
      code: 'TRIP_DISPATCH_LOAD_REMAINING_WITH_FORCE',
      status: 400,
    })
    expect(repository.dispatchCalls).toEqual([])
  })

  test('loadRemaining leva a pendente e a separada para a escrita, sem forçar e sem liberar', async () => {
    const toLoad = [
      { separationStatus: 'pending' as const, tripDocumentId: UNLOADED_ID },
      { separationStatus: 'separated' as const, tripDocumentId: SEPARATED_ID },
    ]
    const repository = createDispatchFakePort({ toLoad })

    const result = await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      loadRemaining: true,
      repository,
      tripId: TRIP_ID,
    })

    expect(result.tripStatus).toBe('dispatched')
    expect(repository.dispatchCalls).toEqual([
      {
        actorUserId: ACTOR_USER_ID,
        channel: TRIP_FIELD_CHANNELS.backoffice,
        companyId: COMPANY_ID,
        documentsToLoad: toLoad,
        forceReason: null,
        forced: false,
        hasRoute: true,
        leftBehind: [],
        onBehalfOfDriverId: null,
        tripId: TRIP_ID,
        unloadedDocumentIds: [],
      },
    ])
  })

  test('loadRemaining não fura o agendamento: só force fura', async () => {
    const repository = createDispatchFakePort({
      unloadedDocumentIds: [UNLOADED_ID],
      unscheduledStopIds: [UNSCHEDULED_STOP_ID],
    })

    const error = await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      loadRemaining: true,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'TRIP_HAS_UNSCHEDULED_STOPS', status: 409 })
    expect(repository.dispatchCalls).toEqual([])
  })

  test('a nota deixada para trás pela ocorrência sai sem force, e o despacho não é forçado', async () => {
    const leftBehind = [{ occurrenceTypeName: 'Item faltante', tripDocumentId: LEFT_BEHIND_ID }]
    const repository = createDispatchFakePort({ leftBehind })

    await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    })

    expect(repository.dispatchCalls[0]).toMatchObject({
      documentsToLoad: [],
      forceReason: null,
      forced: false,
      leftBehind,
      unloadedDocumentIds: [],
    })
  })

  test('só notas deixadas para trás: não despacha viagem vazia — 409 com as notas', async () => {
    const repository = createDispatchFakePort({
      hasLoadedDocument: false,
      leftBehind: [{ occurrenceTypeName: 'Item faltante', tripDocumentId: LEFT_BEHIND_ID }],
    })

    const error = await dispatchTrip({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      loadRemaining: true,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripHasUnloadedDocumentsError)
    expect((error as TripHasUnloadedDocumentsError).documentIds).toEqual([LEFT_BEHIND_ID])
    expect(repository.dispatchCalls).toEqual([])
  })
})

describe('POST /trips/:id/dispatch — corpo (spec 185 T3.1)', () => {
  function dispatchRequest(body: unknown): Request {
    return new Request('http://localhost/v1/trips/id/dispatch', {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
  }

  test('aceita loadRemaining e o devolve, com false por padrão', async () => {
    expect(await parseDispatchTripRequest(dispatchRequest({ loadRemaining: true }))).toEqual({
      force: false,
      forceReason: null,
      loadRemaining: true,
    })
    expect(await parseDispatchTripRequest(dispatchRequest({}))).toMatchObject({
      loadRemaining: false,
    })
  })

  test('loadRemaining junto com force é 400', async () => {
    await expect(
      parseDispatchTripRequest(
        dispatchRequest({ force: true, forceReason: 'motivo', loadRemaining: true }),
      ),
    ).rejects.toMatchObject({ status: 400 })
  })

  test('loadRemaining que não é booleano é 400', async () => {
    await expect(
      parseDispatchTripRequest(dispatchRequest({ loadRemaining: 'sim' })),
    ).rejects.toMatchObject({ status: 400 })
  })
})
