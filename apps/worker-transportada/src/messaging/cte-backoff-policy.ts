/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const CTE_ISSUANCE_BACKOFF_ATTEMPTS_MS = [5_000, 30_000, 300_000] as const

type CalculateCtePersistentBackoffParams = {
  readonly attempt: number
  readonly now: Date
}

type CalculateCtePersistentBackoffResult = {
  readonly attempt: number
  readonly nextAttemptAt: Date
}

export function calculateCtePersistentBackoff(
  params: CalculateCtePersistentBackoffParams,
): CalculateCtePersistentBackoffResult {
  const nextAttempt = params.attempt + 1
  const delayIndex = Math.min(params.attempt, CTE_ISSUANCE_BACKOFF_ATTEMPTS_MS.length - 1)
  const delayMs = CTE_ISSUANCE_BACKOFF_ATTEMPTS_MS[delayIndex]!

  return {
    attempt: nextAttempt,
    nextAttemptAt: new Date(params.now.getTime() + delayMs),
  }
}
