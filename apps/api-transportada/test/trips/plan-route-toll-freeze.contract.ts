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
import { TripStateTransitionNotAllowedError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const TRIP_ID = '22222222-2222-4222-8222-222222222222'

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
  readonly calls: readonly { readonly tripId: string }[]
  freeze: (input: { readonly companyId: string; readonly tripId: string }) => Promise<void>
} {
  const calls: { readonly tripId: string }[] = []
  return {
    calls,
    async freeze(input) {
      calls.push({ tripId: input.tripId })
    },
  }
}

describe('congelamento acoplado ao planejamento (spec 090 T11)', () => {
  test('congela quando a transição é aplicada de verdade (draft -> route_planned)', async () => {
    const repository = createPort({ hasRoute: true, tripStatus: 'draft' })
    const tollFreezer = createFreezer()

    await planTripRoute({ companyId: COMPANY_ID, repository, tollFreezer, tripId: TRIP_ID })

    expect(tollFreezer.calls).toEqual([{ tripId: TRIP_ID }])
  })

  test('congela de novo numa chamada idempotente (roteiro já planejado)', async () => {
    const repository = createPort({ hasRoute: true, tripStatus: 'separating' })
    const tollFreezer = createFreezer()

    const result = await planTripRoute({
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
      companyId: COMPANY_ID,
      repository,
      tollFreezer,
      tripId: TRIP_ID,
    }).catch(() => undefined)

    expect(tollFreezer.calls).toHaveLength(0)
  })

  test('sem congelador injetado, o comportamento é idêntico ao de antes da task', async () => {
    const repository = createPort({ hasRoute: true, tripStatus: 'draft' })

    const result = await planTripRoute({ companyId: COMPANY_ID, repository, tripId: TRIP_ID })

    expect(result.tripStatus).toBe('route_planned')
  })
})

describe('o congelamento não derruba o planejamento (revisão de 2026-09-08)', () => {
  /**
   * ⚠️ O congelamento roda **depois** de `markRoutePlanned`: a viagem já está `route_planned` quando
   * ele começa. Sem guarda, um erro dele — timeout, CHECK de `planned_toll`, conexão caída — sobe e
   * o operador recebe falha numa ação **que deu certo**. No caso persistente ele nunca vê sucesso,
   * mesmo com a viagem planejada no banco.
   *
   * Efeito secundário não pode derrubar o primário: é o `catch` de fallback gracioso que o
   * `code-standart.md` §7 admite, e o único caso em que ele se aplica aqui.
   */
  test('devolve o roteiro planejado mesmo quando o congelamento falha', async () => {
    const repository = createPort({ hasRoute: true, tripStatus: 'draft' })

    const result = await planTripRoute({
      companyId: COMPANY_ID,
      repository,
      tollFreezer: {
        freeze: () => Promise.reject(new Error('planned_toll indisponível')),
      },
      tripId: TRIP_ID,
    })

    expect(result.tripStatus).toBe('route_planned')
  })
})
