/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NFSE_READ_PERMISSION } from './nfseInvoice.constant'
import type { NfseInvoice, NfseInvoiceStatus } from './nfseInvoice.types'

/** Só a nota que passou pela prefeitura tem XML arquivado; as demais entrariam no ZIP como ausência. */
const ARCHIVED_STATUSES: readonly NfseInvoiceStatus[] = [
  'authorized',
  'cancellation_requested',
  'cancelled',
]

export type NfseBulkExportFailure = 'empty' | 'failed' | 'limitExceeded'

export type NfseBulkExportPlan = Readonly<{
  eligible: readonly NfseInvoice[]
  isAllowed: boolean
}>

const FAILURE_BY_ERROR_CODE: Readonly<Record<string, NfseBulkExportFailure>> = {
  NFSE_EXPORT_EMPTY: 'empty',
  NFSE_EXPORT_LIMIT_EXCEEDED: 'limitExceeded',
}

export function planNfseBulkExport(
  input: Readonly<{ invoices: readonly NfseInvoice[]; permissions: readonly string[] }>,
): NfseBulkExportPlan {
  if (!input.permissions.includes(NFSE_READ_PERMISSION)) return { eligible: [], isAllowed: false }

  const eligible = input.invoices.filter((invoice) => ARCHIVED_STATUSES.includes(invoice.status))

  return { eligible, isAllowed: eligible.length > 0 }
}

export function resolveNfseBulkExportFailure(error: unknown): NfseBulkExportFailure {
  const code = error instanceof Error ? error.message : ''
  return FAILURE_BY_ERROR_CODE[code] ?? 'failed'
}
