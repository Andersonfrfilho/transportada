/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseServiceInvoiceStatus } from '../../database/nfse-issuance-execution.schema.js'

/**
 * O status que vem no envelope é diagnóstico: ele descreve o que a nota era quando a mensagem foi
 * gravada, e a mensagem pode chegar fora de ordem ou repetida. Quem decide a transição é a linha
 * lida do banco no momento da escrita.
 *
 * Cópia por valor de `nfse-invoice-state.policy.ts` da API — as apps não importam código uma da
 * outra. `cancelled` reproduz a tabela `confirmCancellation`: só a nota com cancelamento em voo
 * pode virar cancelada.
 */
export const NFSE_WRITE_BACK_KIND = {
  accepted: 'accepted',
  cancelled: 'cancelled',
  failed: 'failed',
  inFlight: 'inFlight',
  rejected: 'rejected',
} as const

export type NfseWriteBackKind = (typeof NFSE_WRITE_BACK_KIND)[keyof typeof NFSE_WRITE_BACK_KIND]

export type NfseWriteBackResolution =
  | { readonly allowed: false }
  | { readonly allowed: true; readonly nextStatus: NfseServiceInvoiceStatus }

const NEXT_STATUS: Readonly<Record<NfseWriteBackKind, NfseServiceInvoiceStatus>> = {
  accepted: 'pending_authorization',
  cancelled: 'cancelled',
  failed: 'failed',
  inFlight: 'issuing',
  rejected: 'rejected',
}

/** `issuing` aceita o próprio in-flight de novo: a reentrega de um retry não é fora de ordem. */
const ALLOWED_FROM: Readonly<Record<NfseWriteBackKind, readonly NfseServiceInvoiceStatus[]>> = {
  accepted: ['issuing', 'requested'],
  cancelled: ['cancellation_requested'],
  /** Dead-letter de cancelamento não derruba a nota: lá fora ela continua autorizada. */
  failed: ['issuing', 'requested'],
  inFlight: ['failed', 'issuing', 'rejected', 'requested'],
  rejected: ['issuing', 'requested'],
}

export function resolveNfseWriteBack(input: {
  readonly kind: NfseWriteBackKind
  readonly storedStatus: NfseServiceInvoiceStatus
}): NfseWriteBackResolution {
  if (!ALLOWED_FROM[input.kind].includes(input.storedStatus)) return { allowed: false }

  return { allowed: true, nextStatus: NEXT_STATUS[input.kind] }
}

export function resolveNfseWriteBackTargetStatus(
  kind: NfseWriteBackKind,
): NfseServiceInvoiceStatus {
  return NEXT_STATUS[kind]
}

export function listNfseWriteBackSourceStatuses(
  kind: NfseWriteBackKind,
): readonly NfseServiceInvoiceStatus[] {
  return ALLOWED_FROM[kind]
}
