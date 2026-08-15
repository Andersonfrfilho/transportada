/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  NFSE_CANCEL_PERMISSION,
  NFSE_CANCELLATION_REASON_MAX_LENGTH,
  NFSE_CANCELLATION_REASON_MIN_LENGTH,
  NFSE_READ_PERMISSION,
} from './nfseInvoice.constant'

const IDEMPOTENCY_KEY_PREFIX = 'nfse-cancellation'

/** A API só transita `authorized` → `cancellation_requested`; oferecer fora daí seria pedir 409. */
const CANCELLABLE_STATUSES: readonly string[] = ['authorized']

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
  isDownloadEnabled: boolean
}>

export type NfseCancellationReasonCheck =
  | Readonly<{ reason: string; status: 'blocked' }>
  | Readonly<{ status: 'ready'; value: string }>

export function resolveNfseRowActions(
  input: Readonly<{ permissions: readonly string[]; status: string }>,
): NfseRowActionState {
  const canRead = input.permissions.includes(NFSE_READ_PERMISSION)
  const canCancel = input.permissions.includes(NFSE_CANCEL_PERMISSION)

  return {
    isCancelEnabled: canCancel && CANCELLABLE_STATUSES.includes(input.status),
    isCancelVisible: canCancel,
    isDetailEnabled: canRead,
    isDownloadEnabled: canRead && NFSE_DOWNLOADABLE_STATUSES.includes(input.status),
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

export function buildNfseCancellationIdempotencyKey(
  input: Readonly<{ invoiceId: string; token: string }>,
): string {
  return `${IDEMPOTENCY_KEY_PREFIX}.${input.invoiceId}.${input.token}`.replaceAll(
    /[^A-Za-z0-9._:-]/gu,
    '-',
  )
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
