/* Copyright (c) 2026 Ada Technology. MIT License. */
import { TRIP_FEEDBACK_KEY_BY_ERROR } from './trip.constant'

export function resolveTripFeedbackKey(error: unknown): null | string {
  if (!(error instanceof Error)) return null
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
