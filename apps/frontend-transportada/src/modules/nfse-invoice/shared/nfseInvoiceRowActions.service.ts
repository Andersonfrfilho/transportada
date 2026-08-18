/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  NFSE_CANCEL_PERMISSION,
  NFSE_CANCELLATION_REASON_MAX_LENGTH,
  NFSE_CANCELLATION_REASON_MIN_LENGTH,
  NFSE_ISSUE_PERMISSION,
  NFSE_READ_PERMISSION,
  NFSE_REISSUE_CORRECTABLE_KEYS,
} from './nfseInvoice.constant'
import type { NfseLastIssuancePayload } from './nfseInvoice.types'

const CANCELLATION_IDEMPOTENCY_KEY_PREFIX = 'nfse-cancellation'
const REISSUE_IDEMPOTENCY_KEY_PREFIX = 'nfse-reissue'
const DISCARD_IDEMPOTENCY_KEY_PREFIX = 'nfse-discard'

/** A API só transita `authorized` → `cancellation_requested`; oferecer fora daí seria pedir 409. */
const CANCELLABLE_STATUSES: readonly string[] = ['authorized']

/** `rejected` e `failed` são as duas saídas de uma nota parada — a política do domínio é a mesma. */
export const REISSUABLE_STATUSES: readonly string[] = ['failed', 'rejected']
export const DISCARDABLE_STATUSES: readonly string[] = ['failed', 'rejected']

/** XML e PDF nascem na autorização e sobrevivem ao cancelamento — antes dela não há arquivo. */
export const NFSE_DOWNLOADABLE_STATUSES: readonly string[] = [
  'authorized',
  'cancellation_requested',
  'cancelled',
]

export type NfseRowActionState = Readonly<{
  isCancelEnabled: boolean
  isCancelVisible: boolean
  isDetailEnabled: boolean
  isDiscardEnabled: boolean
  isDiscardVisible: boolean
  isDownloadEnabled: boolean
  isReissueEnabled: boolean
  isReissueVisible: boolean
}>

export type NfseCancellationReasonCheck =
  | Readonly<{ reason: string; status: 'blocked' }>
  | Readonly<{ status: 'ready'; value: string }>

export function resolveNfseRowActions(
  input: Readonly<{ permissions: readonly string[]; status: string }>,
): NfseRowActionState {
  const canRead = input.permissions.includes(NFSE_READ_PERMISSION)
  const canCancel = input.permissions.includes(NFSE_CANCEL_PERMISSION)
  const canIssue = input.permissions.includes(NFSE_ISSUE_PERMISSION)

  return {
    isCancelEnabled: canCancel && CANCELLABLE_STATUSES.includes(input.status),
    isCancelVisible: canCancel,
    isDetailEnabled: canRead,
    isDiscardEnabled: canCancel && DISCARDABLE_STATUSES.includes(input.status),
    isDiscardVisible: canCancel,
    isDownloadEnabled: canRead && NFSE_DOWNLOADABLE_STATUSES.includes(input.status),
    isReissueEnabled: canIssue && REISSUABLE_STATUSES.includes(input.status),
    isReissueVisible: canIssue,
  }
}

export function validateNfseCancellationReason(reason: string): NfseCancellationReasonCheck {
  const value = reason.trim()

  if (value.length < NFSE_CANCELLATION_REASON_MIN_LENGTH) {
    return { reason: 'reasonTooShort', status: 'blocked' }
  }
  if (value.length > NFSE_CANCELLATION_REASON_MAX_LENGTH) {
    return { reason: 'reasonTooLong', status: 'blocked' }
  }
  return { status: 'ready', value }
}

function buildIdempotencyKey(
  input: Readonly<{ invoiceId: string; prefix: string; token: string }>,
): string {
  return `${input.prefix}.${input.invoiceId}.${input.token}`.replaceAll(/[^A-Za-z0-9._:-]/gu, '-')
}

export function buildNfseCancellationIdempotencyKey(
  input: Readonly<{ invoiceId: string; token: string }>,
): string {
  return buildIdempotencyKey({ ...input, prefix: CANCELLATION_IDEMPOTENCY_KEY_PREFIX })
}

export function buildNfseReissueIdempotencyKey(
  input: Readonly<{ invoiceId: string; token: string }>,
): string {
  return buildIdempotencyKey({ ...input, prefix: REISSUE_IDEMPOTENCY_KEY_PREFIX })
}

export function buildNfseDiscardIdempotencyKey(
  input: Readonly<{ invoiceId: string; token: string }>,
): string {
  return buildIdempotencyKey({ ...input, prefix: DISCARD_IDEMPOTENCY_KEY_PREFIX })
}

export type NfseReissueCorrection = Partial<
  Pick<NfseLastIssuancePayload, (typeof NFSE_REISSUE_CORRECTABLE_KEYS)[number]>
>

/**
 * Só o que mudou entra no corpo — enviar tudo de novo obrigaria a rota a distinguir "confirmou sem
 * mexer" de "corrigiu de volta para o valor congelado", e o corpo `.strict()` já recusa os quatro
 * campos somente-leitura.
 */
export function buildNfseReissueCorrectionBody(
  input: Readonly<{ edited: NfseReissueCorrection; lastPayload: NfseLastIssuancePayload }>,
): NfseReissueCorrection {
  const correction: Record<string, unknown> = {}
  for (const key of NFSE_REISSUE_CORRECTABLE_KEYS) {
    if (!(key in input.edited)) continue
    if (input.edited[key] !== input.lastPayload[key]) correction[key] = input.edited[key]
  }
  return correction
}

/** O documento fiscal sai por link assinado: sem `url` legível não há o que abrir, e mentir é pior. */
export function readNfseDownloadUrl(download: unknown): string {
  if (typeof download !== 'object' || download === null) {
    throw new Error('NFSE_DOWNLOAD_URL_UNAVAILABLE')
  }
  const url = (download as Readonly<{ url?: unknown }>).url
  if (typeof url !== 'string' || url === '') {
    throw new Error('NFSE_DOWNLOAD_URL_UNAVAILABLE')
  }
  return url
}
