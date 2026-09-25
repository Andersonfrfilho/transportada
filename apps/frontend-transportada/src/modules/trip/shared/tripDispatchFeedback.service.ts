/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripRequestError } from './tripClient.service'
import type { AutoDispatchOutcome, TripDispatchBlockedCode, TripStopDetail } from './trip.types'

export type TripDispatchFeedback = Readonly<{
  params?: Readonly<Record<string, string>>
  key: string
}>

/**
 * Cópia por valor de `TRIP_TRANSITION_BLOCK_MESSAGES.TRIP_HAS_NO_ROUTE`
 * (`apps/api-transportada/src/trips/domain/trip.error.ts`) — o único sinal que
 * `STATE_TRANSITION_NOT_ALLOWED` expõe para este motivo específico: o `code` do erro não distingue
 * os motivos de transição bloqueada entre si, só `details[].message` o faz.
 */
const TRIP_HAS_NO_ROUTE_DETAIL_MESSAGE = 'The trip has no planned route.'

function resolveStopLabel(stops: readonly TripStopDetail[], stopId: string): string {
  return stops.find((stop) => stop.id === stopId)?.label ?? stopId
}

/**
 * RF8: as duas recusas de despacho ganham frase própria, com a parada nomeada quando o motivo é
 * agendamento — nunca o genérico "o servidor recusou". Usada tanto para o erro HTTP do botão
 * "Despachar" quanto para `autoDispatch.outcome === 'blocked'`.
 */
export function resolveDispatchBlockedFeedback(input: {
  readonly code: TripDispatchBlockedCode
  readonly stopIds?: readonly string[]
  readonly stops: readonly TripStopDetail[]
}): TripDispatchFeedback {
  if (input.code === 'TRIP_HAS_NO_ROUTE') return { key: 'hasNoRoute' }
  /**
   * Spec 185 revisão (achado 2 da API): o gatilho falhou por um motivo que não é gate de negócio
   * (erro inesperado no `dispatch()`) — a API não manda `stopIds` para este código.
   */
  if (input.code === 'TRIP_AUTO_DISPATCH_FAILED') return { key: 'autoDispatchFailed' }
  const labels = (input.stopIds ?? []).map((stopId) => resolveStopLabel(input.stops, stopId))
  return { key: 'hasUnscheduledStops', params: { stops: labels.join(', ') } }
}

/**
 * O botão "Despachar" (`loadRemaining`) recusa com o mesmo `TRIP_HAS_UNSCHEDULED_STOPS`/
 * `STATE_TRANSITION_NOT_ALLOWED` que o gatilho automático — mas por erro HTTP, não por
 * `autoDispatch`. `details` só existe quando `tripClient` captura (`readErrorDetails`).
 */
export function resolveDispatchErrorFeedback(input: {
  readonly error: unknown
  readonly stops: readonly TripStopDetail[]
}): TripDispatchFeedback | null {
  const error = input.error
  if (!(error instanceof Error)) return null
  const details = (error as TripRequestError).details ?? []

  if (error.message === 'TRIP_HAS_UNSCHEDULED_STOPS') {
    const stopIds = details
      .filter((detail) => detail.field === 'stopId')
      .map((detail) => detail.message)
    return resolveDispatchBlockedFeedback({
      code: 'TRIP_HAS_UNSCHEDULED_STOPS',
      stopIds,
      stops: input.stops,
    })
  }

  if (
    error.message === 'STATE_TRANSITION_NOT_ALLOWED' &&
    details.some(
      (detail) => detail.field === 'status' && detail.message === TRIP_HAS_NO_ROUTE_DETAIL_MESSAGE,
    )
  ) {
    return resolveDispatchBlockedFeedback({ code: 'TRIP_HAS_NO_ROUTE', stops: input.stops })
  }

  /**
   * Spec 185 revisão (achado 2 do frontend): o botão manda `loadRemaining: true` sempre — a única
   * forma de `TRIP_HAS_UNLOADED_DOCUMENTS` chegar por ele é a viagem ficar vazia depois de liberar
   * as notas deixadas para trás (`assertDispatchGates` na API). O genérico "Há notas ainda não
   * carregadas" mentiria aqui: não sobrou nota nenhuma para carregar.
   */
  if (error.message === 'TRIP_HAS_UNLOADED_DOCUMENTS') return { key: 'hasNoCargoToDispatch' }

  return null
}

/** Nenhuma nota vai na viagem: o diálogo explica e não oferece despachar (o clique daria 409). */
export const DISPATCH_CONFIRM_NOTHING_TO_CARRY_KEY = 'stateActions.dispatchConfirmNothingToCarry'

/**
 * RF9 (revisão): uma chave i18n só por caso do diálogo "Despachar" — nunca a concatenação de duas
 * traduções calculadas em TS. O caso combinado (`toLoadCount` e `leftBehindCount` > 0) encaixa as
 * duas contagens no locale por *nesting* do i18next (`$t(...)`), preservando o plural de cada parte.
 */
export function resolveDispatchConfirmMessage(input: {
  readonly isCargoClosed: boolean
  readonly leftBehindCount: number
  readonly toLoadCount: number
}): Readonly<{ key: string; params?: Readonly<Record<string, number>> }> {
  const { isCargoClosed, leftBehindCount, toLoadCount } = input

  if (toLoadCount === 0 && leftBehindCount === 0) {
    return { key: 'stateActions.dispatchConfirmSimple' }
  }

  if (toLoadCount === 0) {
    /**
     * Sem nota a carregar e ao menos uma deixada para trás: com nota já carregada sobrando
     * (`isCargoClosed`), o despacho sai só com as notas que ficarem. Sem nenhuma nota carregada, o
     * despacho recusaria (409 `TRIP_HAS_UNLOADED_DOCUMENTS`, viagem ficaria vazia) — frase própria,
     * sem prometer "Despachar?".
     */
    return isCargoClosed
      ? { key: 'stateActions.dispatchConfirmLeftBehindOnly', params: { count: leftBehindCount } }
      : { key: DISPATCH_CONFIRM_NOTHING_TO_CARRY_KEY }
  }

  return leftBehindCount === 0
    ? { key: 'stateActions.dispatchConfirmLoadRemaining', params: { count: toLoadCount } }
    : {
        key: 'stateActions.dispatchConfirmLoadRemainingWithLeftBehind',
        params: { leftBehindCount, loadCount: toLoadCount },
      }
}

/**
 * RF3: a mutation de carregar (linha/lote) e a de ocorrência de separação leem `autoDispatch` da
 * resposta — `dispatched` é aviso de sucesso, `blocked` é a mesma frase do erro manual.
 */
export function resolveAutoDispatchFeedback(input: {
  readonly autoDispatch: AutoDispatchOutcome | undefined
  readonly stops: readonly TripStopDetail[]
}): TripDispatchFeedback | null {
  if (input.autoDispatch === undefined) return null
  if (input.autoDispatch.outcome === 'dispatched') return { key: 'autoDispatched' }
  return resolveDispatchBlockedFeedback({
    code: input.autoDispatch.code,
    stops: input.stops,
    ...(input.autoDispatch.details === undefined
      ? {}
      : { stopIds: input.autoDispatch.details.stopIds }),
  })
}
