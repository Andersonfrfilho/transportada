/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const NFE_IMPORT_BACKOFF_ATTEMPTS_MS = [5_000, 30_000, 300_000] as const

type CalculateNfePersistentBackoffParams = {
  readonly attempt: number
  readonly now: Date
}

type CalculateNfePersistentBackoffResult = {
  readonly attempt: number
  readonly nextAttemptAt: Date
}

export function calculateNfePersistentBackoff(
  params: CalculateNfePersistentBackoffParams,
): CalculateNfePersistentBackoffResult {
  const nextAttempt = params.attempt + 1
  const delayIndex = Math.min(params.attempt, NFE_IMPORT_BACKOFF_ATTEMPTS_MS.length - 1)
  const delayMs = NFE_IMPORT_BACKOFF_ATTEMPTS_MS[delayIndex]!

  return {
    attempt: nextAttempt,
    nextAttemptAt: new Date(params.now.getTime() + delayMs),
  }
}
