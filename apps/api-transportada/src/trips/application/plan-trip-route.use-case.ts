/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import { TRIP_ACTION, checkTripTransition } from '../domain/trip-state.policy.js'
import { TripNotFoundError, TripStateTransitionNotAllowedError } from '../domain/trip.error.js'
import type { RouteChoice } from '../domain/route-choice.policy.js'

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
    readonly actorUserId: string
    readonly channel: TripFieldChannel
    readonly companyId: string
    /** Defeito 29 (ADR-0068 "Consequências"): reconferido dentro da transação, com o status travado. */
    readonly hasRoute: boolean
    readonly onBehalfOfDriverId: string | null
    readonly tripId: string
  }): Promise<TripStatus>
  readRouteState(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripRouteState | null>
}

/**
 * Spec 090 T11: congela o pedágio da rota, na mesma chamada que planeja o roteiro. Opcional para
 * não obrigar todo teste de estado a montar um roteirizador falso — sem ela, o comportamento é
 * idêntico ao de antes desta task.
 */
export type PlanTripRouteTollFreezer = {
  freeze(input: {
    readonly companyId: string
    readonly routeChoice?: RouteChoice
    readonly tripId: string
  }): Promise<void>
}

export type PlanTripRouteInput = {
  readonly actorUserId: string
  readonly channel: TripFieldChannel
  readonly companyId: string
  readonly onBehalfOfDriverId?: string | null
  readonly repository: PlanTripRoutePort
  /** RF3 (spec 153 T201): qual rota reproduzir. Ausente segue o default do congelador. */
  readonly routeChoice?: RouteChoice
  readonly tollFreezer?: PlanTripRouteTollFreezer
  readonly tripId: string
}

export type PlanTripRouteResult = {
  readonly tripStatus: TripStatus
}

/**
 * ADR-0043 §1: `route_planned` exige ≥1 parada e nenhuma nota sem parada. Idempotente — planejar
 * de novo uma viagem já planejada, ou uma que já andou além disso, não regride nem falha.
 *
 * ⚠️ **O congelamento do pedágio (T11) roda em toda chamada que não é bloqueada** — tanto na
 * transição real (`applied`) quanto na repetição idempotente (`unchanged`, ex: reordenar parada e
 * planejar de novo). Replanejar regrava o congelado; a chamada bloqueada (viagem despachada,
 * cancelada, sem roteiro) nunca chega a este ponto, então despachar nunca recongela.
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

  const tripStatus =
    transition.outcome === 'unchanged'
      ? state.tripStatus
      : await input.repository.markRoutePlanned({
          actorUserId: input.actorUserId,
          channel: input.channel,
          companyId: input.companyId,
          hasRoute: state.hasRoute,
          onBehalfOfDriverId: input.onBehalfOfDriverId ?? null,
          tripId: input.tripId,
        })

  /**
   * ⚠️ **O congelamento não pode derrubar o planejamento.** Ele roda depois de `markRoutePlanned`,
   * com a viagem já em `route_planned`: um erro aqui devolveria falha ao operador para uma ação que
   * deu certo — e, se persistente, ele nunca veria sucesso. É o `catch` de fallback gracioso do
   * `code-standart.md` §7, não captura para logar e relançar.
   *
   * O preço é o pedágio ficar sem congelar até o próximo replanejamento — e ausência de congelado
   * já é caso tratado: a parcela volta ao lançamento manual e a tela diz que ninguém lançou. É
   * subestimar dizendo que subestima, que é a direção segura desta linha de trabalho.
   */
  if (input.tollFreezer !== undefined) {
    try {
      await input.tollFreezer.freeze({
        companyId: input.companyId,
        ...(input.routeChoice === undefined ? {} : { routeChoice: input.routeChoice }),
        tripId: input.tripId,
      })
    } catch {
      /* o roteiro está planejado; o pedágio congela no próximo replanejamento */
    }
  }

  return { tripStatus }
}
