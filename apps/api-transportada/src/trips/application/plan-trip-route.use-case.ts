/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import { TRIP_ACTION, checkTripTransition } from '../domain/trip-state.policy.js'
import { TripNotFoundError, TripStateTransitionNotAllowedError } from '../domain/trip.error.js'

export type TripRouteState = {
  /**
   * `true` só quando existe ≥1 parada **e** nenhuma nota viva (não devolvida, não liberada) está
   * sem parada — o balde `SEM ENDEREÇO` do RF-9 é, do ponto de vista desta task, uma nota sem
   * `stop_id`. Quem cria esse balde é o fluxo de vínculo (T012); aqui só se lê a consequência.
   */
  readonly hasRoute: boolean
  readonly tripStatus: TripStatus
}

export type PlanTripRoutePort = {
  markRoutePlanned(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripStatus>
  readRouteState(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripRouteState | null>
}

export type PlanTripRouteInput = {
  readonly companyId: string
  readonly repository: PlanTripRoutePort
  readonly tripId: string
}

export type PlanTripRouteResult = {
  readonly tripStatus: TripStatus
}

/**
 * ADR-0043 §1: `route_planned` exige ≥1 parada e nenhuma nota sem parada. Idempotente — planejar
 * de novo uma viagem já planejada, ou uma que já andou além disso, não regride nem falha.
 */
export async function planTripRoute(input: PlanTripRouteInput): Promise<PlanTripRouteResult> {
  const state = await input.repository.readRouteState(input)
  if (state === null) throw new TripNotFoundError()

  const transition = checkTripTransition({
    action: TRIP_ACTION.planRoute,
    hasRoute: state.hasRoute,
    tripStatus: state.tripStatus,
  })

  if (transition.outcome === 'blocked') {
    throw new TripStateTransitionNotAllowedError(transition.reason)
  }
  if (transition.outcome === 'unchanged') return { tripStatus: state.tripStatus }

  const tripStatus = await input.repository.markRoutePlanned(input)
  return { tripStatus }
}
