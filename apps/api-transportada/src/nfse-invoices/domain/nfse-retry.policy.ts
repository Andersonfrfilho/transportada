/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A janela da prefeitura não é a da SEFAZ: a Nota RP responde a emissão de forma assíncrona e uma
 * indisponibilidade municipal costuma durar minutos, não segundos. Por isso a curva começa em 30s
 * e vai até meia hora, em vez dos 5s do trilho fiscal estadual.
 */
export const NFSE_RETRY_DEFAULT_MAX_ATTEMPTS = 5
export const NFSE_RETRY_DEFAULT_BACKOFF_SECONDS: readonly number[] = [30, 120, 600, 1_800]
export const NFSE_RETRY_MAX_ATTEMPTS_LIMIT = 10
export const NFSE_RETRY_BACKOFF_STEPS_LIMIT = 10

const MILLISECONDS_PER_SECOND = 1_000

export class NfseRetryPolicyInvalidError extends Error {
  override readonly name = 'NfseRetryPolicyInvalidError'
}

export type NfseRetryPolicy = {
  readonly backoffSeconds: readonly number[]
  readonly maxAttempts: number
}

export type NfseRetryPolicyInput = {
  readonly backoffSeconds?: readonly number[] | null | undefined
  readonly maxAttempts?: number | null | undefined
}

/** `attemptsMade` conta entregas já consumidas, então a primeira falha vale 1. */
export type NfseRetryAttemptInput = {
  readonly attemptsMade: number
  readonly policy: NfseRetryPolicy
}

export function createNfseRetryPolicy(input: NfseRetryPolicyInput): NfseRetryPolicy {
  return {
    backoffSeconds: normalizeBackoffSeconds(input.backoffSeconds),
    maxAttempts: normalizeMaxAttempts(input.maxAttempts),
  }
}

export function resolveNfseRetryDelaySeconds(input: NfseRetryAttemptInput): number {
  const lastIndex = input.policy.backoffSeconds.length - 1
  const index = Math.min(Math.max(input.attemptsMade - 1, 0), lastIndex)
  const delaySeconds = input.policy.backoffSeconds[index]
  if (delaySeconds === undefined) throw new NfseRetryPolicyInvalidError('backoff curve is empty')

  return delaySeconds
}

export function calculateNfseRetryNextAttemptAt(
  input: NfseRetryAttemptInput & { readonly now: Date },
): Date {
  return new Date(
    input.now.getTime() + resolveNfseRetryDelaySeconds(input) * MILLISECONDS_PER_SECOND,
  )
}

export function isNfseRetryExhausted(input: NfseRetryAttemptInput): boolean {
  return input.attemptsMade >= input.policy.maxAttempts
}

function normalizeMaxAttempts(value: number | null | undefined): number {
  if (value === null || value === undefined) return NFSE_RETRY_DEFAULT_MAX_ATTEMPTS
  if (!Number.isInteger(value) || value < 1 || value > NFSE_RETRY_MAX_ATTEMPTS_LIMIT) {
    throw new NfseRetryPolicyInvalidError(
      `maxAttempts must be an integer between 1 and ${NFSE_RETRY_MAX_ATTEMPTS_LIMIT}`,
    )
  }

  return value
}

function normalizeBackoffSeconds(value: readonly number[] | null | undefined): readonly number[] {
  if (value === null || value === undefined) return [...NFSE_RETRY_DEFAULT_BACKOFF_SECONDS]
  if (value.length < 1 || value.length > NFSE_RETRY_BACKOFF_STEPS_LIMIT) {
    throw new NfseRetryPolicyInvalidError(
      `backoffSeconds must hold between 1 and ${NFSE_RETRY_BACKOFF_STEPS_LIMIT} steps`,
    )
  }
  for (const step of value) {
    if (!Number.isInteger(step) || step < 1) {
      throw new NfseRetryPolicyInvalidError('backoffSeconds must hold positive integer seconds')
    }
  }

  return [...value]
}
