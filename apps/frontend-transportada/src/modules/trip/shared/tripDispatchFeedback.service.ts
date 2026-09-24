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

  return null
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
