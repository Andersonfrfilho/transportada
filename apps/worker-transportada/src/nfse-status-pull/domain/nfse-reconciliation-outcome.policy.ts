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
  readonly serviceAmount?: string
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

/** A nota vinculada à mão: o valor congelado na tentativa é o que o portal tem de confirmar. */
export type NfseExternalLinkFacts = { readonly serviceAmount: string }

export const NFSE_EXTERNAL_LINK_NOT_FOUND = 'NFSE_EXTERNAL_LINK_NOT_FOUND'
export const NFSE_EXTERNAL_LINK_AMOUNT_MISMATCH = 'NFSE_EXTERNAL_LINK_AMOUNT_MISMATCH'

const EXTERNAL_LINK_NOT_FOUND_MESSAGE =
  'A Nota RP não encontrou a nota informada no vínculo; confira o id_nota no portal.'
const EXTERNAL_LINK_AMOUNT_MISMATCH_MESSAGE =
  'O valor da nota vinculada no portal difere do valor desta nota de serviço.'

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
  readonly externalLink?: NfseExternalLinkFacts
  readonly provider: NfseProviderStatusFacts
  readonly storedStatus: NfseReconciliationSourceStatus
}): NfseReconciliationDecision {
  if (input.externalLink !== undefined) {
    const linkDecision = resolveExternalLinkRejection({
      externalLink: input.externalLink,
      provider: input.provider,
    })
    if (linkDecision !== undefined) return linkDecision
  }
  if (input.provider.status === 'error') {
    return { cause: input.provider.cause ?? 'transport_failure', kind: 'defer' }
  }
  if (input.provider.status === 'pending') return STILL_PENDING

  return input.storedStatus === 'cancellation_requested'
    ? resolveForCancellationRequested(input.provider)
    : resolveForPendingAuthorization(input.provider)
}

function resolveExternalLinkRejection(input: {
  readonly externalLink: NfseExternalLinkFacts
  readonly provider: NfseProviderStatusFacts
}): NfseReconciliationDecision | undefined {
  const { provider } = input
  if (provider.status === 'error' && provider.cause === 'not_found') {
    return {
      errorCode: NFSE_EXTERNAL_LINK_NOT_FOUND,
      errorMessage: EXTERNAL_LINK_NOT_FOUND_MESSAGE,
      kind: 'reject',
    }
  }
  if (provider.status !== 'authorized' || provider.document === undefined) return undefined

  const { serviceAmount } = provider.document
  if (
    serviceAmount !== undefined &&
    normalizeDecimal(serviceAmount) === normalizeDecimal(input.externalLink.serviceAmount)
  ) {
    return undefined
  }
  return {
    errorCode: NFSE_EXTERNAL_LINK_AMOUNT_MISMATCH,
    errorMessage: EXTERNAL_LINK_AMOUNT_MISMATCH_MESSAGE,
    kind: 'reject',
  }
}

/** `1500`, `1500.00` e `1500.0000` são o mesmo valor; a comparação é textual, sem float. */
function normalizeDecimal(value: string): string {
  const trimmed = value.trim()
  return trimmed.includes('.') ? trimmed.replace(/0+$/u, '').replace(/\.$/u, '') : trimmed
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
