/* Copyright (c) 2026 Ada Technology. MIT License. */
import { TRIP_FEEDBACK_KEY_BY_ERROR } from './trip.constant'

export function resolveTripFeedbackKey(error: unknown): null | string {
  if (!(error instanceof Error)) return null
  return TRIP_FEEDBACK_KEY_BY_ERROR[error.message] ?? 'requestFailed'
}

/** A tela mostra um alerta por vez: vence o primeiro erro pendente entre as mutations. */
export function resolveFirstTripFeedbackKey(errors: readonly unknown[]): null | string {
  for (const error of errors) {
    const key = resolveTripFeedbackKey(error)
    if (key !== null) return key
  }
  return null
}
