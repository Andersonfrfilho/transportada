import {
  readTableColumnPreferences,
  reorderTableColumns,
  writeTableColumnPreferences,
  type TableColumnPreferences,
  type TableColumnStorage,
} from '@/modules/shared/tableColumnPreferences.service'
import { compareScaledAmounts, sumScaledAmounts } from '@/modules/shared/decimalAmount.service'

import type { NfseInvoice, NfseInvoiceFilters, NfseInvoiceStatus } from './nfseInvoice.types'

export const NFSE_INVOICE_COLUMN_KEYS = [
  'takerLegalName',
  'documentCount',
  'serviceAmount',
  'issAmount',
  'status',
  'providerNumber',
  'verificationCode',
  'createdAt',
  'authorizedAt',
] as const
export type NfseInvoiceColumnKey = (typeof NFSE_INVOICE_COLUMN_KEYS)[number]

export const NFSE_INVOICE_COLUMNS_STORAGE_KEY = 'nfse-invoice.invoices.columns.v1'

const MONEY_COLUMNS: readonly NfseInvoiceColumnKey[] = ['serviceAmount', 'issAmount']

export type NfseInvoiceSortState = null | Readonly<{
  column: NfseInvoiceColumnKey
  direction: 'asc' | 'desc'
}>

export type NfseInvoiceColumnPreferences = TableColumnPreferences<NfseInvoiceColumnKey>

export type NfseInvoiceTableFilters = Readonly<{
  createdFrom: string
  createdUntil: string
  statuses: readonly NfseInvoiceStatus[]
  takerTaxId: string
}>

export const EMPTY_NFSE_INVOICE_FILTERS: NfseInvoiceTableFilters = {
  createdFrom: '',
  createdUntil: '',
  statuses: [],
  takerTaxId: '',
}

export function nextNfseInvoiceSortState(
  current: NfseInvoiceSortState,
  column: NfseInvoiceColumnKey,
): NfseInvoiceSortState {
  if (current === null || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}

export function sortNfseInvoices(
  invoices: readonly NfseInvoice[],
  sort: NfseInvoiceSortState,
): readonly NfseInvoice[] {
  if (sort === null) return invoices
  const factor = sort.direction === 'asc' ? 1 : -1
  return [...invoices].sort((left, right) => compareInvoices(left, right, sort.column) * factor)
}

/** A soma da seleção atravessa páginas: dinheiro é string decimal e o total também. */
export function sumNfseInvoiceServiceAmount(invoices: readonly NfseInvoice[]): string {
  return sumScaledAmounts(invoices.map((invoice) => invoice.serviceAmount))
}

export function reorderNfseInvoiceColumns(
  order: readonly NfseInvoiceColumnKey[],
  column: NfseInvoiceColumnKey,
  direction: 'down' | 'up',
): readonly NfseInvoiceColumnKey[] {
  return reorderTableColumns(order, column, direction)
}

export function readNfseInvoiceColumnPreferences(
  storage: TableColumnStorage | null,
): NfseInvoiceColumnPreferences {
  return readTableColumnPreferences({
    columns: NFSE_INVOICE_COLUMN_KEYS,
    storage,
    storageKey: NFSE_INVOICE_COLUMNS_STORAGE_KEY,
  })
}

export function writeNfseInvoiceColumnPreferences(
  input: Readonly<{
    preferences: NfseInvoiceColumnPreferences
    storage: TableColumnStorage | null
  }>,
): void {
  writeTableColumnPreferences({
    preferences: input.preferences,
    storage: input.storage,
    storageKey: NFSE_INVOICE_COLUMNS_STORAGE_KEY,
  })
}

export function toggleNfseInvoiceStatus(
  statuses: readonly NfseInvoiceStatus[],
  status: NfseInvoiceStatus,
): readonly NfseInvoiceStatus[] {
  return statuses.includes(status)
    ? statuses.filter((candidate) => candidate !== status)
    : [...statuses, status]
}

export function countActiveNfseInvoiceFilters(filters: NfseInvoiceTableFilters): number {
  let count = 0
  if (filters.createdFrom.length > 0 || filters.createdUntil.length > 0) count += 1
  if (filters.statuses.length > 0) count += 1
  if (filters.takerTaxId.length > 0) count += 1
  return count
}

/**
 * Status, período e tomador são filtrados no servidor — a listagem pagina por cursor e filtrar só a
 * página carregada esconderia o resto do resultado. A API valida `createdFrom`/`createdUntil` como
 * instante ISO completo, então o dia escolhido no calendário é alargado aqui.
 */
export function serializeNfseInvoiceQuery(
  input: Readonly<{ cursor: null | string; filters: NfseInvoiceTableFilters; limit: number }>,
): Readonly<{ cursor: null | string; filters: NfseInvoiceFilters; limit: number }> {
  const filters: Record<string, unknown> = {}
  if (input.filters.createdFrom.length > 0) {
    filters['createdFrom'] = `${input.filters.createdFrom}T00:00:00.000Z`
  }
  if (input.filters.createdUntil.length > 0) {
    filters['createdUntil'] = `${input.filters.createdUntil}T23:59:59.999Z`
  }
  if (input.filters.statuses.length > 0) filters['statusIn'] = input.filters.statuses
  if (input.filters.takerTaxId.length > 0) filters['takerTaxIdEq'] = input.filters.takerTaxId

  return { cursor: input.cursor, filters, limit: input.limit }
}

function compareInvoices(
  left: NfseInvoice,
  right: NfseInvoice,
  column: NfseInvoiceColumnKey,
): number {
  if (MONEY_COLUMNS.includes(column)) {
    return compareScaledAmounts(String(left[column]), String(right[column]))
  }
  if (column === 'documentCount') return left.documentCount - right.documentCount
  return readText(left, column).localeCompare(readText(right, column), 'pt-BR')
}

function readText(invoice: NfseInvoice, column: NfseInvoiceColumnKey): string {
  return invoice[column] === null ? '' : String(invoice[column])
}
