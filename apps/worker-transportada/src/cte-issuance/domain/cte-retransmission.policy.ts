/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteIssuanceItemStatus } from './cte-batch-progress.policy.js'

/** Causa do retry depois que a SEFAZ acusou número já usado: o número novo nunca foi transmitido. */
export const FISCAL_NUMBER_BURNED_CAUSE = 'fiscal_number_burned'

export type CteAttemptTransmissionState = {
  readonly lastErrorCause: string | null
  readonly status: CteIssuanceItemStatus
} | null

/**
 * `in_flight` só é gravado depois da checagem da nota, imediatamente antes do gateway: redelivery
 * nesse estado, ou retry de erro/timeout com o mesmo número, pode ter chegado à SEFAZ. Rejeitar ali
 * seria abandonar um CT-e que talvez exista — quem reconcilia a duplicidade é o gateway.
 */
export function mayHaveReachedSefaz(state: CteAttemptTransmissionState): boolean {
  if (state === null) return false
  if (state.status === 'in_flight') return true
  if (state.status !== 'retry_scheduled') return false

  return !(state.lastErrorCause ?? '').startsWith(FISCAL_NUMBER_BURNED_CAUSE)
}
