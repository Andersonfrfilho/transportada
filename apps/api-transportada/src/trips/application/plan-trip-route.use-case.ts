/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import { TRIP_ACTION, checkTripTransition } from '../domain/trip-state.policy.js'
import {
  TripNotFoundError,
  TripRouteUnavailableError,
  TripStateTransitionNotAllowedError,
} from '../domain/trip.error.js'
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
    /**
     * Spec 158 T13: o que a transação reconfere sob o lock é o **status**. Este `hasRoute` é o valor
     * da decisão do caso de uso, ainda lido fora dela — roteiro apagado na janela fica fora do
     * escopo da T13, e o eixo protegido é `trips.status`.
     */
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
  }): Promise<PlanTripRouteFreezeResult>
}

/**
 * `routeFrozen: false` é o roteirizador (OSRM/depósito/praças) sem responder com uma rota —
 * "falha é ausência, nunca reta" (`osrm-route-geometry.gateway.ts`), então `freeze` grava
 * `planned_route`/`planned_toll` nulos **sem lançar**. Sem este sinal, `planTripRoute` não tinha
 * como distinguir "congelou de verdade" de "congelou nulo", e marcava `route_planned` nos dois
 * casos — o status afirmando um roteiro que o próprio congelamento admite não ter.
 */
export type PlanTripRouteFreezeResult = { readonly routeFrozen: boolean }

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
 * ⚠️ **O congelamento roda ANTES de marcar `route_planned`, e uma falha dele propaga.** Desde a
 * spec 153 T201 ele não grava só o pedágio — traçado, métricas e pedágio nascem juntos, numa
 * escrita só (`freeze-trip-planned-route.use-case.ts`). Gravar o status primeiro e engolir o erro
 * do congelamento (revisão de 2026-09-08, válida quando só o pedágio dependia dele) passou a
 * deixar a viagem `route_planned` sem roteiro nenhum quando o congelamento falhava de verdade —
 * o status afirmando um planejamento que não existe. Falha aqui bloqueia a transição: a viagem
 * fica no status anterior, e quem chamou decide se tenta de novo.
 *
 * ⚠️ **`routeFrozen: false` bloqueia a transição real do mesmo jeito, mesmo sem exceção.** O
 * roteirizador indisponível não lança — grava rota nula de propósito (D5, "falha é ausência,
 * nunca reta") — e sem este segundo gate a viagem virava `route_planned` com `planned_route`,
 * `planned_distance_meters` e `planned_toll` todos nulos: o defeito medido na bancada, onde a
 * exceção nunca existiu para o `catch` anterior capturar.
 *
 * Roda em toda chamada que não é bloqueada — tanto na transição real (`applied`) quanto na
 * repetição idempotente (`unchanged`, ex: reordenar parada e planejar de novo), preservando o
 * recongelamento do replanejamento. A chamada bloqueada (viagem despachada, cancelada, sem
 * roteiro) nunca chega a este ponto, então despachar nunca recongela.
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

  if (input.tollFreezer !== undefined) {
    const freezeResult = await input.tollFreezer.freeze({
      companyId: input.companyId,
      ...(input.routeChoice === undefined ? {} : { routeChoice: input.routeChoice }),
      tripId: input.tripId,
    })
    /**
     * Spec 178 RF6: a troca de critério pede `routeChoice` explicitamente — e aí uma falha do
     * roteirizador precisa recusar, mesmo numa repetição idempotente (`unchanged`), porque o
     * operador está esperando a rota nova, não a de sempre. Fora de uma troca explícita, a
     * repetição idempotente continua tolerando `routeFrozen: false` sem lançar (spec 090/153):
     * reordenar parada com o roteirizador fora do ar não pode travar a reordenação.
     */
    if (
      !freezeResult.routeFrozen &&
      (transition.outcome === 'applied' || input.routeChoice !== undefined)
    ) {
      throw new TripRouteUnavailableError()
    }
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

  return { tripStatus }
}
