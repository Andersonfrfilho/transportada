/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Traduz o que a prefeitura respondeu, somado ao que a nota já era aqui, na única decisão que a
 * reconciliação pode tomar. Regra pura: nenhuma leitura de banco, nenhuma chamada de rede.
 */

/**
 * As sete causas de adiamento, e a lista existe para ser **percorrida**: a tradução delas nas quatro
 * palavras do catálogo mora em `nfse-status-pull-failure.policy.ts`, e é o contrato que garante que
 * nenhuma fique sem destino.
 */
export const NFSE_STATUS_FAILURE_CAUSES = [
  'credential_unreadable',
  'malformed_response',
  'not_found',
  'provider_not_configured',
  'timeout',
  'transport_failure',
  'unexpected_status',
] as const

export type NfseStatusFailureCause = (typeof NFSE_STATUS_FAILURE_CAUSES)[number]

export type NfseAuthorizedDocumentFacts = {
  readonly authorizedAt: string
  readonly fiscalNumber: string
  readonly providerDocumentId: string
  readonly verificationCode: string
}

export type NfseRejectionFacts = {
  readonly code: string
  readonly message: string
}

export type NfseProviderStatusFacts =
  | { readonly document?: NfseAuthorizedDocumentFacts; readonly status: 'authorized' }
  | { readonly cancelledAt?: string; readonly status: 'cancelled' }
  | { readonly cause?: NfseStatusFailureCause; readonly status: 'error' }
  | { readonly rejection?: NfseRejectionFacts; readonly status: 'rejected' }
  | { readonly status: 'pending' }

export type NfseReconciliationSourceStatus = 'cancellation_requested' | 'pending_authorization'

export type NfseRescheduleCause = 'cancellation_pending' | 'pending' | 'unexpected_provider_status'

export type NfseReconciliationDecision =
  | { readonly cancelledAt?: string; readonly kind: 'confirmCancellation' }
  | { readonly cause: NfseRescheduleCause; readonly kind: 'reschedule' }
  | { readonly cause: NfseStatusFailureCause; readonly kind: 'defer' }
  | { readonly document: NfseAuthorizedDocumentFacts; readonly kind: 'authorize' }
  | { readonly errorCode: string; readonly errorMessage: string; readonly kind: 'reject' }

const MALFORMED: NfseReconciliationDecision = { cause: 'malformed_response', kind: 'defer' }
const UNEXPECTED: NfseReconciliationDecision = {
  cause: 'unexpected_provider_status',
  kind: 'reschedule',
}
const STILL_PENDING: NfseReconciliationDecision = { cause: 'pending', kind: 'reschedule' }

export function resolveNfseReconciliationDecision(input: {
  readonly provider: NfseProviderStatusFacts
  readonly storedStatus: NfseReconciliationSourceStatus
}): NfseReconciliationDecision {
  if (input.provider.status === 'error') {
    return { cause: input.provider.cause ?? 'transport_failure', kind: 'defer' }
  }
  if (input.provider.status === 'pending') return STILL_PENDING

  return input.storedStatus === 'cancellation_requested'
    ? resolveForCancellationRequested(input.provider)
    : resolveForPendingAuthorization(input.provider)
}

function resolveForPendingAuthorization(
  provider: NfseProviderStatusFacts,
): NfseReconciliationDecision {
  if (provider.status === 'authorized') {
    return provider.document === undefined
      ? MALFORMED
      : { document: provider.document, kind: 'authorize' }
  }
  if (provider.status === 'rejected') {
    return provider.rejection === undefined
      ? MALFORMED
      : {
          errorCode: provider.rejection.code,
          errorMessage: provider.rejection.message,
          kind: 'reject',
        }
  }
  return UNEXPECTED
}

function resolveForCancellationRequested(
  provider: NfseProviderStatusFacts,
): NfseReconciliationDecision {
  if (provider.status === 'cancelled') {
    return provider.cancelledAt === undefined
      ? { kind: 'confirmCancellation' }
      : { cancelledAt: provider.cancelledAt, kind: 'confirmCancellation' }
  }
  /** Ainda autorizada lá fora: o pedido de cancelamento não foi processado, e a nota espera. */
  if (provider.status === 'authorized') return { cause: 'cancellation_pending', kind: 'reschedule' }
  return UNEXPECTED
}
