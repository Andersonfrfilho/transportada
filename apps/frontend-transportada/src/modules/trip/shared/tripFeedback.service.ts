/* Copyright (c) 2026 Ada Technology. MIT License. */
import { TRIP_FEEDBACK_KEY_BY_ERROR } from './trip.constant'
import type { TripRequestError } from './tripClient.service'

/** Cópia por valor de `TRIP_TRANSITION_BLOCK_MESSAGES.TRIP_HAS_NO_ROUTE` da API (ver `tripDispatchFeedback.service.ts`). */
const TRIP_HAS_NO_ROUTE_DETAIL_MESSAGE = 'The trip has no planned route.'

export function resolveTripFeedbackKey(error: unknown): null | string {
  if (!(error instanceof Error)) return null
  /**
   * `STATE_TRANSITION_NOT_ALLOWED` é um código só para vários motivos; o motivo viaja em `details`.
   * Viagem sem parada nenhuma (ex.: só a coleta de canhoto ainda não encaixada) dizia "não é mais
   * permitida no estado atual" — falso, a viagem ainda é rascunho. Diz o que falta.
   */
  if (error.message === 'STATE_TRANSITION_NOT_ALLOWED') {
    const details = (error as TripRequestError).details ?? []
    if (details.some((detail) => detail.message === TRIP_HAS_NO_ROUTE_DETAIL_MESSAGE)) {
      return 'planRouteNoStops'
    }
  }
  /**
   * ⚠️ O padrão **não** é `requestFailed`. Ele fala em internet, e o servidor que respondeu e
   * recusou não tem nada a ver com internet: em 23/09 um `422` legítimo virou "confira a internet",
   * o operador conferiu, tentou de novo e recebeu a mesma frase. Mensagem errada manda procurar o
   * defeito onde ele não está — `serverRefused` diz o que se sabe e não inventa a causa.
   */
  return TRIP_FEEDBACK_KEY_BY_ERROR[error.message] ?? 'serverRefused'
}

/** A tela mostra um alerta por vez: vence o primeiro erro pendente entre as mutations. */
export function resolveFirstTripFeedbackKey(errors: readonly unknown[]): null | string {
  for (const error of errors) {
    const key = resolveTripFeedbackKey(error)
    if (key !== null) return key
  }
  return null
}
