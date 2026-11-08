/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: quando um recibo volta à fila e quando desiste. Espera crescente; esgotou, `failed` — nunca some.
 */
import { NFE_XML_RECEIPT_LIMITS } from './nfe-xml-receipt.constant.js'

export type ReceiptRetryDecision =
  | { readonly kind: 'fail' }
  | { readonly kind: 'retry'; readonly nextAttemptAt: Date }

/** `attemptsDone` conta a tentativa que acabou de falhar. */
export function decideReceiptRetry(input: {
  readonly attemptsDone: number
  readonly now: Date
}): ReceiptRetryDecision {
  const { maxAttempts, retryBackoffSeconds } = NFE_XML_RECEIPT_LIMITS
  if (input.attemptsDone >= maxAttempts) return { kind: 'fail' }
  const last = retryBackoffSeconds.length - 1
  const seconds = retryBackoffSeconds[Math.min(Math.max(input.attemptsDone - 1, 0), last)] ?? 60
  return { kind: 'retry', nextAttemptAt: new Date(input.now.getTime() + seconds * 1000) }
}
