/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 090 T11: o pedágio se congela em toda chamada de planejamento que não é bloqueada — tanto
 * na transição real quanto na repetição idempotente (reordenar parada e planejar de novo).
 * Despachar nunca chama `planTripRoute`, então nunca recongela por este caminho.
 */
import { describe, expect, test } from 'bun:test'

import { planTripRoute } from '../../src/trips/application/plan-trip-route.use-case.js'
import type {
  PlanTripRoutePort,
  TripRouteState,
} from '../../src/trips/application/plan-trip-route.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { TripStateTransitionNotAllowedError } from '../../src/trips/domain/trip.error.js'
import type { RouteChoice } from '../../src/trips/domain/route-choice.policy.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const TRIP_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_USER_ID = '33333333-3333-4333-8333-333333333333'

function createPort(overrides: {
  readonly hasRoute?: boolean
  readonly tripStatus?: TripRouteState['tripStatus']
}): PlanTripRoutePort {
  return {
    async markRoutePlanned() {
      return 'route_planned'
    },
    async readRouteState() {
      return { hasRoute: overrides.hasRoute ?? true, tripStatus: overrides.tripStatus ?? 'draft' }
    },
  }
}

function createFreezer(): {
  readonly calls: readonly { readonly routeChoice?: RouteChoice; readonly tripId: string }[]
  freeze: (input: {
    readonly companyId: string
    readonly routeChoice?: RouteChoice
    readonly tripId: string
  }) => Promise<void>
} {
  const calls: { readonly routeChoice?: RouteChoice; readonly tripId: string }[] = []
  return {
    calls,
    async freeze(input) {
      calls.push(
        input.routeChoice === undefined
          ? { tripId: input.tripId }
          : { routeChoice: input.routeChoice, tripId: input.tripId },
      )
    },
  }
}

describe('congelamento acoplado ao planejamento (spec 090 T11)', () => {
  test('congela quando a transição é aplicada de verdade (draft -> route_planned)', async () => {
    const repository = createPort({ hasRoute: true, tripStatus: 'draft' })
    const tollFreezer = createFreezer()

    await planTripRoute({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tollFreezer,
      tripId: TRIP_ID,
    })

    expect(tollFreezer.calls).toEqual([{ tripId: TRIP_ID }])
  })

  test('congela de novo numa chamada idempotente (roteiro já planejado)', async () => {
    const repository = createPort({ hasRoute: true, tripStatus: 'separating' })
    const tollFreezer = createFreezer()

    const result = await planTripRoute({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tollFreezer,
      tripId: TRIP_ID,
    })

    expect(result.tripStatus).toBe('separating')
    expect(tollFreezer.calls).toEqual([{ tripId: TRIP_ID }])
  })

  test('não congela quando a viagem já foi despachada — a chamada é bloqueada antes disso', async () => {
    const repository = createPort({ hasRoute: true, tripStatus: 'dispatched' })
    const tollFreezer = createFreezer()

    const error = await planTripRoute({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tollFreezer,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripStateTransitionNotAllowedError)
    expect(tollFreezer.calls).toHaveLength(0)
  })

  test('não congela quando não há roteiro — a chamada é bloqueada antes disso', async () => {
    const repository = createPort({ hasRoute: false, tripStatus: 'draft' })
    const tollFreezer = createFreezer()

    await planTripRoute({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tollFreezer,
      tripId: TRIP_ID,
    }).catch(() => undefined)

    expect(tollFreezer.calls).toHaveLength(0)
  })

  test('sem congelador injetado, o comportamento é idêntico ao de antes da task', async () => {
    const repository = createPort({ hasRoute: true, tripStatus: 'draft' })

    const result = await planTripRoute({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    })

    expect(result.tripStatus).toBe('route_planned')
  })

  /** RF3 (spec 153 T201): a rota pedida no corpo do HTTP chega ao congelamento sem se perder. */
  test('a escolha de rota do pedido chega ao congelador (spec 153 RF3)', async () => {
    const repository = createPort({ hasRoute: true, tripStatus: 'draft' })
    const tollFreezer = createFreezer()
    const routeChoice: RouteChoice = { criterion: 'fastest', signature: null }

    await planTripRoute({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      routeChoice,
      tollFreezer,
      tripId: TRIP_ID,
    })

    expect(tollFreezer.calls).toEqual([{ routeChoice, tripId: TRIP_ID }])
  })

  test('sem escolha declarada no pedido, o congelador não recebe `routeChoice`', async () => {
    const repository = createPort({ hasRoute: true, tripStatus: 'draft' })
    const tollFreezer = createFreezer()

    await planTripRoute({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tollFreezer,
      tripId: TRIP_ID,
    })

    expect(tollFreezer.calls).toEqual([{ tripId: TRIP_ID }])
  })
})

describe('o congelamento que falha não pode deixar o status mentir', () => {
  /**
   * ⚠️ Desde a spec 153 T201 o congelamento grava traçado, métricas e pedágio juntos — não só o
   * pedágio. Uma revisão anterior (2026-09-08) engolia o erro daqui achando que só o pedágio
   * ficaria sem congelar; o efeito real era a viagem virar `route_planned` sem roteiro nenhum
   * (distância, rota e pedágio nulos) — o status afirmando um planejamento que não aconteceu.
   * Agora a falha propaga e a transição não se aplica: `markRoutePlanned` nem chega a ser chamado.
   */
  test('propaga o erro do congelamento e não marca a viagem como planejada', async () => {
    const repository = createPort({ hasRoute: true, tripStatus: 'draft' })
    let markRoutePlannedCalls = 0
    const guardedRepository: PlanTripRoutePort = {
      ...repository,
      async markRoutePlanned(markInput) {
        markRoutePlannedCalls += 1
        return repository.markRoutePlanned(markInput)
      },
    }

    const error = await planTripRoute({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository: guardedRepository,
      tollFreezer: {
        freeze: () => Promise.reject(new Error('planned_toll indisponível')),
      },
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect(markRoutePlannedCalls).toBe(0)
  })
})
