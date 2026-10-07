/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseIssuanceStatus } from '../../database/nfse.schema.js'

const AMBIGUOUS_FAILED_STATUS: NfseIssuanceStatus = 'failed'
const AMBIGUOUS_CAUSES: ReadonlySet<string> = new Set([
  'malformed_response',
  'timeout',
  'transport_failure',
  'unexpected_status',
])

/** O que a tentativa anterior deixou para trás, lido antes de a reemissão abrir a seguinte. */
export type NfseIssuanceAttemptHistory = {
  readonly lastErrorCause: string | null
  readonly providerDocumentId: string | null
  readonly providerRequestKey: string | null
  readonly status: NfseIssuanceStatus
}

/**
 * A chave de idempotência do provedor (`hash_pedido`) da tentativa nova. Devolve a chave a **copiar**
 * só quando a anterior terminou ambígua — falhou por timeout, transporte, status inesperado ou resposta ilegível sem o provedor ter devolvido
 * o id da nota, então a nota pode existir lá e uma chave nova a duplicaria. Em qualquer outro caso
 * devolve `undefined`, e a chave da tentativa nova é o próprio `attemptId`.
 */
export function resolveInheritedProviderRequestKey(
  previous: NfseIssuanceAttemptHistory | null,
): string | undefined {
  if (previous === null) return undefined
  if (previous.status !== AMBIGUOUS_FAILED_STATUS) return undefined
  if (previous.providerDocumentId !== null) return undefined
  if (previous.lastErrorCause === null || !AMBIGUOUS_CAUSES.has(previous.lastErrorCause)) {
    return undefined
  }
  return previous.providerRequestKey ?? undefined
}
