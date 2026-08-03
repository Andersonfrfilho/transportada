/* Copyright (c) 2026 Ada Technology. MIT License. */
import { compareScaledAmounts, sumScaledAmounts } from '@/modules/shared/decimalAmount.service'
import {
  readTableColumnPreferences,
  reorderTableColumns,
  writeTableColumnPreferences,
  type TableColumnPreferences,
  type TableColumnStorage,
} from '@/modules/shared/tableColumnPreferences.service'

import type { BillingEligibleCte } from './billingClient.service'
import {
  normalizeDocumentDigits,
  normalizeMoneyInput,
  normalizeNameQuery,
  parseNumberFilterInput,
} from './billingEligibleFilterValue.service'

export const BILLING_ELIGIBLE_COLUMN_KEYS = [
  'cteNumber',
  'nfeNumber',
  'customerName',
  'customerDocument',
  'batchName',
  'issuedAt',
  'totalAmount',
] as const

export type BillingEligibleColumnKey = (typeof BILLING_ELIGIBLE_COLUMN_KEYS)[number]

export const BILLING_ELIGIBLE_COLUMNS_STORAGE_KEY = 'billing.eligible.columns.v1'

export type BillingEligibleTableFilters = Readonly<{
  batchId: string
  cteNumberQuery: string
  customerDocument: string
  customerName: string
  issuedFrom: string
  issuedTo: string
  maxAmount: string
  minAmount: string
  nfeNumberQuery: string
}>

export const EMPTY_BILLING_ELIGIBLE_FILTERS: BillingEligibleTableFilters = {
  batchId: '',
  cteNumberQuery: '',
  customerDocument: '',
  customerName: '',
  issuedFrom: '',
  issuedTo: '',
  maxAmount: '',
  minAmount: '',
  nfeNumberQuery: '',
}

export type BillingEligibleSortState = null | Readonly<{
  column: string
  direction: 'asc' | 'desc'
}>

export type BillingEligiblePageState = Readonly<{
  cursor: null | string
  history: readonly (null | string)[]
}>

export const BILLING_ELIGIBLE_FIRST_PAGE: BillingEligiblePageState = { cursor: null, history: [] }

export type BillingEligibleColumnPreferences = TableColumnPreferences<BillingEligibleColumnKey>

export type BillingEligibleAmounts = Readonly<{
  customerDocument: string
  customerName: string
  totalAmount: string
}>

export type BillingEligibleSelectionSummary = Readonly<{
  count: number
  customerDocuments: readonly string[]
  totalAmount: string
}>

export function countActiveBillingEligibleFilters(filters: BillingEligibleTableFilters): number {
  return Object.values(filters).filter((value) => value.length > 0).length
}

export function serializeBillingEligibleQuery(
  input: Readonly<{
    cursor: null | string
    filters: BillingEligibleTableFilters
    limit: number
  }>,
): string {
  const search = new URLSearchParams()
  search.set('limit', String(input.limit))
  if (input.cursor !== null) search.set('cursor', input.cursor)

  const cteNumber = parseNumberFilterInput(input.filters.cteNumberQuery)
  const cteValues = cteNumber.ok ? cteNumber.values : undefined
  const cteRange = cteNumber.ok ? cteNumber.range : undefined
  const nfeNumber = parseNumberFilterInput(input.filters.nfeNumberQuery)
  const nfeValues = nfeNumber.ok ? nfeNumber.values : undefined
  const nfeRange = nfeNumber.ok ? nfeNumber.range : undefined
  const fields: Readonly<Record<string, string | undefined>> = {
    batchId: input.filters.batchId.trim().length > 0 ? input.filters.batchId.trim() : undefined,
    cteNumberFrom: cteRange?.from,
    cteNumberIn: cteValues === undefined ? undefined : cteValues.join(','),
    cteNumberTo: cteRange?.to,
    customerDocument: normalizeDocumentDigits(input.filters.customerDocument),
    customerName: normalizeNameQuery(input.filters.customerName),
    issuedFrom: input.filters.issuedFrom.length > 0 ? input.filters.issuedFrom : undefined,
    issuedTo: input.filters.issuedTo.length > 0 ? input.filters.issuedTo : undefined,
    maxAmount: normalizeMoneyInput(input.filters.maxAmount),
    minAmount: normalizeMoneyInput(input.filters.minAmount),
    nfeNumberFrom: nfeRange?.from,
    nfeNumberIn: nfeValues === undefined ? undefined : nfeValues.join(','),
    nfeNumberTo: nfeRange?.to,
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) search.set(key, value)
  }

  return search.toString()
}

export function nextBillingEligibleSortState(
  current: BillingEligibleSortState,
  column: string,
): BillingEligibleSortState {
  if (current === null || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}

function textColumnValue(row: BillingEligibleCte, column: string): string {
  if (column === 'customerName') return row.customerName
  if (column === 'customerDocument') return row.customerDocument
  return row.batchName
}

/** Nota sem vínculo vai para o fim; comparar como texto colocaria `43` antes de `9`. */
function compareNoteNumbers(left: null | string, right: null | string): number {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  return BigInt(left) < BigInt(right) ? -1 : 1
}

function compareInstants(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function compareColumn(
  column: string,
  left: BillingEligibleCte,
  right: BillingEligibleCte,
): number {
  if (column === 'cteNumber') {
    const difference = BigInt(left.cteNumber) - BigInt(right.cteNumber)
    if (difference === 0n) return 0
    return difference > 0n ? 1 : -1
  }
  if (column === 'nfeNumber') return compareNoteNumbers(left.nfeNumber, right.nfeNumber)
  if (column === 'totalAmount') return compareScaledAmounts(left.totalAmount, right.totalAmount)
  if (column === 'issuedAt') return compareInstants(left.issuedAt, right.issuedAt)
  return textColumnValue(left, column).localeCompare(textColumnValue(right, column), 'pt-BR')
}

export function sortBillingEligibleCtes(
  items: readonly BillingEligibleCte[],
  sort: BillingEligibleSortState,
): readonly BillingEligibleCte[] {
  if (sort === null) return items
  const factor = sort.direction === 'asc' ? 1 : -1
  return [...items].sort((left, right) => compareColumn(sort.column, left, right) * factor)
}

export function toggleBillingEligibleSelection(
  selectedIds: readonly string[],
  cteId: string,
): readonly string[] {
  return selectedIds.includes(cteId)
    ? selectedIds.filter((id) => id !== cteId)
    : [...selectedIds, cteId]
}

export function toggleAllBillingEligibleSelection(
  input: Readonly<{ pageIds: readonly string[]; selectedIds: readonly string[] }>,
): readonly string[] {
  const isPageSelected = input.pageIds.every((id) => input.selectedIds.includes(id))
  return isPageSelected
    ? input.selectedIds.filter((id) => !input.pageIds.includes(id))
    : [...input.selectedIds, ...input.pageIds.filter((id) => !input.selectedIds.includes(id))]
}

export function accumulateBillingEligibleAmounts(
  input: Readonly<{
    items: readonly BillingEligibleCte[]
    known: ReadonlyMap<string, BillingEligibleAmounts>
  }>,
): ReadonlyMap<string, BillingEligibleAmounts> {
  const amounts = new Map(input.known)
  for (const item of input.items) {
    amounts.set(item.cteId, {
      customerDocument: item.customerDocument,
      customerName: item.customerName,
      totalAmount: item.totalAmount,
    })
  }
  return amounts
}

/** Uma fatura é de um tomador só: a seleção precisa denunciar quando atravessa mais de um. */
export function summarizeBillingEligibleSelection(
  input: Readonly<{
    amounts: ReadonlyMap<string, BillingEligibleAmounts>
    selectedIds: readonly string[]
  }>,
): BillingEligibleSelectionSummary {
  const selected = input.selectedIds.flatMap((id) => {
    const amounts = input.amounts.get(id)
    return amounts === undefined ? [] : [amounts]
  })
  const documents = [...new Set(selected.map((amounts) => amounts.customerDocument))].toSorted()
  return {
    count: selected.length,
    customerDocuments: documents,
    totalAmount: sumScaledAmounts(selected.map((amounts) => amounts.totalAmount)),
  }
}

export function nextBillingEligiblePage(
  state: BillingEligiblePageState,
  nextCursor: null | string,
): BillingEligiblePageState {
  if (nextCursor === null) return state
  return { cursor: nextCursor, history: [...state.history, state.cursor] }
}

export function previousBillingEligiblePage(
  state: BillingEligiblePageState,
): BillingEligiblePageState {
  const previousCursor = state.history.at(-1)
  if (previousCursor === undefined) return BILLING_ELIGIBLE_FIRST_PAGE
  return { cursor: previousCursor, history: state.history.slice(0, -1) }
}

export function canGoToPreviousBillingEligiblePage(state: BillingEligiblePageState): boolean {
  return state.history.length > 0
}

export function reorderBillingEligibleColumns(
  order: readonly BillingEligibleColumnKey[],
  column: BillingEligibleColumnKey,
  direction: 'down' | 'up',
): readonly BillingEligibleColumnKey[] {
  return reorderTableColumns(order, column, direction)
}

export function readBillingEligibleColumnPreferences(
  storage: TableColumnStorage | null,
): BillingEligibleColumnPreferences {
  return readTableColumnPreferences({
    columns: BILLING_ELIGIBLE_COLUMN_KEYS,
    storage,
    storageKey: BILLING_ELIGIBLE_COLUMNS_STORAGE_KEY,
  })
}

export function writeBillingEligibleColumnPreferences(
  input: Readonly<{
    preferences: BillingEligibleColumnPreferences
    storage: TableColumnStorage | null
  }>,
): void {
  writeTableColumnPreferences({ ...input, storageKey: BILLING_ELIGIBLE_COLUMNS_STORAGE_KEY })
}
