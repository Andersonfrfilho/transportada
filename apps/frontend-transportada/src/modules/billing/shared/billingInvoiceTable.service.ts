/* Copyright (c) 2026 Ada Technology. MIT License. */
import { compareScaledAmounts } from '@/modules/shared/decimalAmount.service'
import {
  readTableColumnPreferences,
  reorderTableColumns,
  writeTableColumnPreferences,
  type TableColumnPreferences,
  type TableColumnStorage,
} from '@/modules/shared/tableColumnPreferences.service'

import type { BillingInvoiceSummary } from './billingClient.service'

export const BILLING_INVOICE_COLUMN_KEYS = [
  'invoiceNumber',
  'status',
  'customerName',
  'customerDocument',
  'issuedAt',
  'dueDate',
  'itemCount',
  'totalAmount',
  'createdAt',
] as const

export type BillingInvoiceColumnKey = (typeof BILLING_INVOICE_COLUMN_KEYS)[number]

export const BILLING_INVOICE_COLUMNS_STORAGE_KEY = 'billing.invoices.columns.v1'

export type BillingInvoiceTableFilters = Readonly<{
  customerDocument: string
  dueFrom: string
  dueTo: string
  invoiceNumber: string
  issuedFrom: string
  issuedTo: string
  status: string
}>

export const EMPTY_BILLING_INVOICE_FILTERS: BillingInvoiceTableFilters = {
  customerDocument: '',
  dueFrom: '',
  dueTo: '',
  invoiceNumber: '',
  issuedFrom: '',
  issuedTo: '',
  status: '',
}

/** Cada faixa de data é um par de campos que só faz sentido junto — na tela e na pílula. */
export const BILLING_INVOICE_DATE_RANGES = {
  dueRange: { from: 'dueFrom', to: 'dueTo' },
  issuedRange: { from: 'issuedFrom', to: 'issuedTo' },
} as const satisfies Readonly<
  Record<
    string,
    Readonly<{ from: keyof BillingInvoiceTableFilters; to: keyof BillingInvoiceTableFilters }>
  >
>

export type BillingInvoiceDateRangeField = keyof typeof BILLING_INVOICE_DATE_RANGES

export type BillingInvoiceSortState = null | Readonly<{
  column: string
  direction: 'asc' | 'desc'
}>

export type BillingInvoicePageState = Readonly<{
  cursor: null | string
  history: readonly (null | string)[]
}>

export const BILLING_INVOICE_FIRST_PAGE: BillingInvoicePageState = { cursor: null, history: [] }

export type BillingInvoiceColumnPreferences = TableColumnPreferences<BillingInvoiceColumnKey>

export function countActiveBillingInvoiceFilters(filters: BillingInvoiceTableFilters): number {
  return Object.values(filters).filter((value) => value.length > 0).length
}

export function serializeBillingInvoiceQuery(
  input: Readonly<{
    cursor: null | string
    filters: BillingInvoiceTableFilters
    limit: number
  }>,
): string {
  const search = new URLSearchParams()
  search.set('limit', String(input.limit))
  if (input.cursor !== null) search.set('cursor', input.cursor)

  const fields: Readonly<Record<string, string>> = {
    customerDocument: input.filters.customerDocument,
    dueFrom: input.filters.dueFrom,
    dueTo: input.filters.dueTo,
    invoiceNumber: input.filters.invoiceNumber,
    issuedFrom: input.filters.issuedFrom,
    issuedTo: input.filters.issuedTo,
    status: input.filters.status,
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value.length > 0) search.set(key, value)
  }

  return search.toString()
}

export function nextBillingInvoiceSortState(
  current: BillingInvoiceSortState,
  column: string,
): BillingInvoiceSortState {
  if (current === null || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}

function stringColumnValue(row: BillingInvoiceSummary, column: string): string {
  if (column === 'customerName') return row.customer.name
  if (column === 'customerDocument') return row.customer.document
  if (column === 'status') return row.status
  if (column === 'issuedAt') return row.issuedAt
  if (column === 'dueDate') return row.dueDate
  return row.createdAt
}

function compareColumn(
  column: string,
  left: BillingInvoiceSummary,
  right: BillingInvoiceSummary,
): number {
  if (column === 'invoiceNumber') return left.invoiceNumber - right.invoiceNumber
  if (column === 'itemCount') return left.itemCount - right.itemCount
  if (column === 'totalAmount') return compareScaledAmounts(left.totalAmount, right.totalAmount)
  return stringColumnValue(left, column).localeCompare(stringColumnValue(right, column), 'pt-BR')
}

export function sortBillingInvoices(
  items: readonly BillingInvoiceSummary[],
  sort: BillingInvoiceSortState,
): readonly BillingInvoiceSummary[] {
  if (sort === null) return items
  const factor = sort.direction === 'asc' ? 1 : -1
  return [...items].sort((left, right) => compareColumn(sort.column, left, right) * factor)
}

export function toggleBillingInvoiceSelection(
  selectedIds: readonly string[],
  invoiceId: string,
): readonly string[] {
  return selectedIds.includes(invoiceId)
    ? selectedIds.filter((id) => id !== invoiceId)
    : [...selectedIds, invoiceId]
}

export function toggleAllBillingInvoiceSelection(
  input: Readonly<{ pageIds: readonly string[]; selectedIds: readonly string[] }>,
): readonly string[] {
  const isPageSelected = input.pageIds.every((id) => input.selectedIds.includes(id))
  return isPageSelected
    ? input.selectedIds.filter((id) => !input.pageIds.includes(id))
    : [...input.selectedIds, ...input.pageIds.filter((id) => !input.selectedIds.includes(id))]
}

export function nextBillingInvoicePage(
  state: BillingInvoicePageState,
  nextCursor: null | string,
): BillingInvoicePageState {
  if (nextCursor === null) return state
  return { cursor: nextCursor, history: [...state.history, state.cursor] }
}

export function previousBillingInvoicePage(
  state: BillingInvoicePageState,
): BillingInvoicePageState {
  const previousCursor = state.history.at(-1)
  if (previousCursor === undefined) return BILLING_INVOICE_FIRST_PAGE
  return { cursor: previousCursor, history: state.history.slice(0, -1) }
}

export function canGoToPreviousBillingInvoicePage(state: BillingInvoicePageState): boolean {
  return state.history.length > 0
}

export function reorderBillingInvoiceColumns(
  order: readonly BillingInvoiceColumnKey[],
  column: BillingInvoiceColumnKey,
  direction: 'down' | 'up',
): readonly BillingInvoiceColumnKey[] {
  return reorderTableColumns(order, column, direction)
}

export function readBillingInvoiceColumnPreferences(
  storage: TableColumnStorage | null,
): BillingInvoiceColumnPreferences {
  return readTableColumnPreferences({
    columns: BILLING_INVOICE_COLUMN_KEYS,
    storage,
    storageKey: BILLING_INVOICE_COLUMNS_STORAGE_KEY,
  })
}

export function writeBillingInvoiceColumnPreferences(
  input: Readonly<{
    preferences: BillingInvoiceColumnPreferences
    storage: TableColumnStorage | null
  }>,
): void {
  writeTableColumnPreferences({ ...input, storageKey: BILLING_INVOICE_COLUMNS_STORAGE_KEY })
}
