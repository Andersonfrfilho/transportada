/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Copy of the API domain policy — the worker duplicates fiscal schema and rules by convention. */
export const MDFE_RETRY_DEFAULT_MAX_ATTEMPTS = 3
export const MDFE_RETRY_DEFAULT_BACKOFF_SECONDS: readonly number[] = [5, 30, 300]
export const MDFE_RETRY_MAX_ATTEMPTS_LIMIT = 10
export const MDFE_RETRY_BACKOFF_STEPS_LIMIT = 10

const MILLISECONDS_PER_SECOND = 1_000

export class MdfeRetryPolicyInvalidError extends Error {
  override readonly name = 'MdfeRetryPolicyInvalidError'
}

export type MdfeRetryPolicy = {
  readonly backoffSeconds: readonly number[]
  readonly maxAttempts: number
}

export type MdfeRetryPolicyInput = {
  readonly backoffSeconds?: readonly number[] | null | undefined
  readonly maxAttempts?: number | null | undefined
}

/** `attemptsMade` counts deliveries already consumed, so the first failure is 1. */
export type MdfeRetryAttemptInput = {
  readonly attemptsMade: number
  readonly policy: MdfeRetryPolicy
}

export function createMdfeRetryPolicy(input: MdfeRetryPolicyInput): MdfeRetryPolicy {
  return {
    backoffSeconds: normalizeBackoffSeconds(input.backoffSeconds),
    maxAttempts: normalizeMaxAttempts(input.maxAttempts),
  }
}

export function resolveMdfeRetryDelaySeconds(input: MdfeRetryAttemptInput): number {
  const lastIndex = input.policy.backoffSeconds.length - 1
  const index = Math.min(Math.max(input.attemptsMade - 1, 0), lastIndex)
  const delaySeconds = input.policy.backoffSeconds[index]
  if (delaySeconds === undefined) throw new MdfeRetryPolicyInvalidError('backoff curve is empty')

  return delaySeconds
}

export function calculateMdfeRetryNextAttemptAt(
  input: MdfeRetryAttemptInput & { readonly now: Date },
): Date {
  return new Date(
    input.now.getTime() + resolveMdfeRetryDelaySeconds(input) * MILLISECONDS_PER_SECOND,
  )
}

export function isMdfeRetryExhausted(input: MdfeRetryAttemptInput): boolean {
  return input.attemptsMade >= input.policy.maxAttempts
}

function normalizeMaxAttempts(value: number | null | undefined): number {
  if (value === null || value === undefined) return MDFE_RETRY_DEFAULT_MAX_ATTEMPTS
  if (!Number.isInteger(value) || value < 1 || value > MDFE_RETRY_MAX_ATTEMPTS_LIMIT) {
    throw new MdfeRetryPolicyInvalidError(
      `maxAttempts must be an integer between 1 and ${MDFE_RETRY_MAX_ATTEMPTS_LIMIT}`,
    )
  }

  return value
}

function normalizeBackoffSeconds(value: readonly number[] | null | undefined): readonly number[] {
  if (value === null || value === undefined) return [...MDFE_RETRY_DEFAULT_BACKOFF_SECONDS]
  if (value.length < 1 || value.length > MDFE_RETRY_BACKOFF_STEPS_LIMIT) {
    throw new MdfeRetryPolicyInvalidError(
      `backoffSeconds must hold between 1 and ${MDFE_RETRY_BACKOFF_STEPS_LIMIT} steps`,
    )
  }
  for (const step of value) {
    if (!Number.isInteger(step) || step < 1) {
      throw new MdfeRetryPolicyInvalidError('backoffSeconds must hold positive integer seconds')
    }
  }

  return [...value]
}
