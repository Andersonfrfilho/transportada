/* Copyright (c) 2026 Ada Technology. MIT License. */
import { compareScaledAmounts } from '@/modules/shared/decimalAmount.service'
import type {
  TableColumnPreferences,
  TableColumnStorage,
} from '@/modules/shared/tableColumnPreferences.service'
import {
  readTableColumnPreferences,
  reorderTableColumns,
  writeTableColumnPreferences,
} from '@/modules/shared/tableColumnPreferences.service'

import type { CompanyCteItem } from './cteBatchItem.types'

export type {
  CteItemAmounts,
  CteItemPageState,
  CteItemSelectionSummary,
} from './cteBatchItemSelection.service'
export {
  accumulateCteItemAmounts,
  canGoToPreviousCteItemPage,
  CTE_ITEM_FIRST_PAGE,
  nextCteItemPage,
  previousCteItemPage,
  summarizeCteItemSelection,
} from './cteBatchItemSelection.service'

export const CTE_ITEM_COLUMN_KEYS = [
  'cteNumber',
  'status',
  'billingStatus',
  'batchName',
  'invoiceNumbers',
  'issuedAt',
  'baseAmount',
  'totalAmount',
  'fiscalAmount',
  'createdAt',
  'lastErrorCode',
  'accessKey',
] as const

export type CteItemColumnKey = (typeof CTE_ITEM_COLUMN_KEYS)[number]

export const CTE_ITEM_COLUMNS_STORAGE_KEY = 'cte-batch.items.columns.v1'

/** Teto do `limit` da API — pedir mais devolve 400, então a lista de opções para em 100. */
export const CTE_ITEM_PAGE_SIZES = [25, 50, 100] as const

export type CteItemPageSize = (typeof CTE_ITEM_PAGE_SIZES)[number]

export const CTE_ITEM_DEFAULT_PAGE_SIZE: CteItemPageSize = 25

export function parseCteItemPageSize(value: string): CteItemPageSize {
  const parsed = Number(value)
  return CTE_ITEM_PAGE_SIZES.find((size) => size === parsed) ?? CTE_ITEM_DEFAULT_PAGE_SIZE
}

export const CTE_ITEM_STATUS_VALUES = [
  'authorized',
  'cancelled',
  'failed',
  'in_flight',
  'pending',
  'reconciliation_required',
  'rejected',
  'retry_scheduled',
] as const

export type CteItemStatus = (typeof CTE_ITEM_STATUS_VALUES)[number]

export const CTE_ITEM_BILLING_STATUS_VALUES = ['invoiced', 'pending'] as const

export type CteItemBillingStatus = (typeof CTE_ITEM_BILLING_STATUS_VALUES)[number]

/** CT-e já enviado à SEFAZ sai da lista por padrão — só volta quando o chip revela o status. */
export const CTE_ITEM_DEFAULT_HIDDEN_STATUSES: readonly CteItemStatus[] = [
  'authorized',
  'cancelled',
  'in_flight',
]

export type CteItemTableFilters = Readonly<{
  batchId: string
  billingStatuses: readonly CteItemBillingStatus[]
  cteNumberQuery: string
  invoiceNumberQuery: string
  issuedFrom: string
  issuedTo: string
  statuses: readonly CteItemStatus[]
}>

export const CTE_ITEM_DEFAULT_STATUSES: readonly CteItemStatus[] = CTE_ITEM_STATUS_VALUES.filter(
  (status) => !CTE_ITEM_DEFAULT_HIDDEN_STATUSES.includes(status),
)

export const EMPTY_CTE_ITEM_FILTERS: CteItemTableFilters = {
  batchId: '',
  billingStatuses: CTE_ITEM_BILLING_STATUS_VALUES,
  cteNumberQuery: '',
  invoiceNumberQuery: '',
  issuedFrom: '',
  issuedTo: '',
  statuses: CTE_ITEM_DEFAULT_STATUSES,
}

/** Um campo por entidade aceita valor exato, lista separada por vírgula e faixa com hífen. */
export type NumberQuery =
  | { readonly type: 'empty' }
  | { readonly type: 'exact'; readonly value: string }
  | { readonly type: 'invalid' }
  | { readonly type: 'list'; readonly values: readonly string[] }
  | { readonly type: 'range'; readonly from: string; readonly to: string }

const POSITIVE_INTEGER_PATTERN = /^[0-9]+$/

export function parseNumberQuery(raw: string): NumberQuery {
  const trimmed = raw.replace(/\s+/g, '')
  if (trimmed.length === 0) return { type: 'empty' }
  if (trimmed.includes('-')) return parseRangeQuery(trimmed)
  if (trimmed.includes(',')) return parseListQuery(trimmed)
  if (!isPositiveInteger(trimmed)) return { type: 'invalid' }
  return { type: 'exact', value: trimmed }
}

function parseRangeQuery(trimmed: string): NumberQuery {
  const parts = trimmed.split('-')
  const [from, to] = parts
  if (parts.length !== 2 || from === undefined || to === undefined) return { type: 'invalid' }
  if (!isPositiveInteger(from) || !isPositiveInteger(to)) return { type: 'invalid' }
  return { type: 'range', from, to }
}

function parseListQuery(trimmed: string): NumberQuery {
  const values = trimmed.split(',')
  if (values.some((value) => !isPositiveInteger(value))) return { type: 'invalid' }
  return { type: 'list', values }
}

function isPositiveInteger(value: string): boolean {
  return POSITIVE_INTEGER_PATTERN.test(value)
}

export type CteItemSortState = null | Readonly<{
  column: CteItemColumnKey
  direction: 'asc' | 'desc'
}>

export type CteItemColumnPreferences = TableColumnPreferences<CteItemColumnKey>

const NUMERIC_COLUMNS: readonly CteItemColumnKey[] = [
  'baseAmount',
  'cteNumber',
  'fiscalAmount',
  'totalAmount',
]

export function toggleCteItemStatus(
  filters: CteItemTableFilters,
  status: CteItemStatus,
): CteItemTableFilters {
  const statuses = filters.statuses.includes(status)
    ? filters.statuses.filter((current) => current !== status)
    : [...filters.statuses, status]
  return { ...filters, statuses }
}

export function toggleCteItemBillingStatus(
  filters: CteItemTableFilters,
  status: CteItemBillingStatus,
): CteItemTableFilters {
  const selected = filters.billingStatuses.includes(status)
    ? filters.billingStatuses.filter((current) => current !== status)
    : [...filters.billingStatuses, status]
  return {
    ...filters,
    billingStatuses: CTE_ITEM_BILLING_STATUS_VALUES.filter((current) => selected.includes(current)),
  }
}

export function countActiveCteItemFilters(filters: CteItemTableFilters): number {
  const scalarFields = [
    filters.batchId,
    filters.cteNumberQuery,
    filters.invoiceNumberQuery,
    filters.issuedFrom,
    filters.issuedTo,
  ]
  const statusesChanged = hasDefaultStatuses(filters.statuses) ? 0 : 1
  const billingChanged =
    filters.billingStatuses.length === CTE_ITEM_BILLING_STATUS_VALUES.length ? 0 : 1
  return scalarFields.filter((field) => field.length > 0).length + statusesChanged + billingChanged
}

export function serializeCteItemQuery(
  input: Readonly<{
    cursor: null | string
    filters: CteItemTableFilters
    limit: number
  }>,
): string {
  const search = new URLSearchParams()
  search.set('limit', String(input.limit))
  if (input.cursor !== null) search.set('cursor', input.cursor)
  applyCteItemFilters(search, input.filters)
  return search.toString()
}

/** O resumo cobre o recorte inteiro: os mesmos filtros da listagem, sem cursor nem limite. */
export function serializeCteItemSummaryQuery(
  input: Readonly<{
    batchIdIn?: readonly string[]
    filters?: CteItemTableFilters
  }>,
): string {
  const search = new URLSearchParams()
  if (input.filters !== undefined) applyCteItemFilters(search, input.filters)
  if (input.batchIdIn !== undefined && input.batchIdIn.length > 0) {
    search.set('batchIdIn', input.batchIdIn.join(','))
  }
  return search.toString()
}

function applyCteItemFilters(search: URLSearchParams, filters: CteItemTableFilters): void {
  const fields = {
    batchId: filters.batchId,
    billingStatusIn: toBillingStatusIn(filters.billingStatuses),
    issuedFrom: toIssuedFromInstant(filters.issuedFrom),
    issuedUntil: toIssuedUntilInstant(filters.issuedTo),
    statusIn: toStatusIn(filters.statuses),
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value.length > 0) search.set(key, value)
  }
  applyNumberQuery(search, filters.cteNumberQuery, {
    gte: 'cteNumberGte',
    in: 'cteNumberIn',
    lte: 'cteNumberLte',
  })
  applyNumberQuery(search, filters.invoiceNumberQuery, {
    gte: 'invoiceNumberGte',
    in: 'invoiceNumberIn',
    lte: 'invoiceNumberLte',
  })
}

function applyNumberQuery(
  search: URLSearchParams,
  raw: string,
  keys: Readonly<{ gte: string; in: string; lte: string }>,
): void {
  const parsed = parseNumberQuery(raw)
  if (parsed.type === 'exact') search.set(keys.in, parsed.value)
  if (parsed.type === 'list') search.set(keys.in, parsed.values.join(','))
  if (parsed.type === 'range') {
    search.set(keys.gte, parsed.from)
    search.set(keys.lte, parsed.to)
  }
}

export function nextCteItemSortState(
  current: CteItemSortState,
  column: CteItemColumnKey,
): CteItemSortState {
  if (current === null || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}

export function sortCteItems(
  items: readonly CompanyCteItem[],
  sort: CteItemSortState,
): readonly CompanyCteItem[] {
  if (sort === null) return items
  const factor = sort.direction === 'asc' ? 1 : -1
  return [...items].sort((left, right) => {
    const leftValue = columnValue(left, sort.column)
    const rightValue = columnValue(right, sort.column)
    if (leftValue === null || rightValue === null) return compareMissing(leftValue, rightValue)
    return compareColumn({ column: sort.column, left: leftValue, right: rightValue }) * factor
  })
}

export function reorderCteItemColumns(
  order: readonly CteItemColumnKey[],
  column: CteItemColumnKey,
  direction: 'down' | 'up',
): readonly CteItemColumnKey[] {
  return reorderTableColumns(order, column, direction)
}

export function readCteItemColumnPreferences(
  storage: TableColumnStorage | null,
): CteItemColumnPreferences {
  return readTableColumnPreferences({
    columns: CTE_ITEM_COLUMN_KEYS,
    storage,
    storageKey: CTE_ITEM_COLUMNS_STORAGE_KEY,
  })
}

export function writeCteItemColumnPreferences(
  input: Readonly<{
    preferences: CteItemColumnPreferences
    storage: TableColumnStorage | null
  }>,
): void {
  writeTableColumnPreferences({ ...input, storageKey: CTE_ITEM_COLUMNS_STORAGE_KEY })
}

function hasDefaultStatuses(statuses: readonly CteItemStatus[]): boolean {
  return (
    statuses.length === CTE_ITEM_DEFAULT_STATUSES.length &&
    CTE_ITEM_DEFAULT_STATUSES.every((status) => statuses.includes(status))
  )
}

/** Lista completa (ou vazia) não restringe nada — melhor não mandar a chave do que mandar tudo. */
function toStatusIn(statuses: readonly CteItemStatus[]): string {
  if (statuses.length === 0 || statuses.length === CTE_ITEM_STATUS_VALUES.length) return ''
  return CTE_ITEM_STATUS_VALUES.filter((status) => statuses.includes(status)).join(',')
}

function toBillingStatusIn(statuses: readonly CteItemBillingStatus[]): string {
  if (statuses.length === 0 || statuses.length === CTE_ITEM_BILLING_STATUS_VALUES.length) return ''
  return statuses.join(',')
}

/** Exportada porque a exportação por filtro precisa do mesmo recorte de dia que a listagem. */
export function toIssuedFromInstant(value: string): string {
  return value.length === 0 ? '' : `${value}T00:00:00.000Z`
}

export function toIssuedUntilInstant(value: string): string {
  return value.length === 0 ? '' : `${value}T23:59:59.999Z`
}

function columnValue(item: CompanyCteItem, column: CteItemColumnKey): null | string {
  if (column === 'cteNumber') return item.fiscalNumber
  if (column === 'billingStatus') return item.billingStatus
  if (column === 'batchName') return item.batchName
  if (column === 'invoiceNumbers') return toInvoiceNumbers(item)
  if (column === 'issuedAt') return item.authorizedAt
  if (column === 'baseAmount') return item.baseAmount
  if (column === 'totalAmount') return item.totalAmount
  if (column === 'fiscalAmount') return item.fiscalAmount
  if (column === 'createdAt') return item.createdAt
  if (column === 'lastErrorCode') return item.lastErrorCode
  if (column === 'accessKey') return item.accessKey
  return item.status
}

export function toInvoiceNumbers(item: CompanyCteItem): null | string {
  if (item.documents.length === 0) return null
  return item.documents.map((document) => document.number).join(', ')
}

function compareMissing(left: null | string, right: null | string): number {
  if (left === right) return 0
  return left === null ? 1 : -1
}

function compareColumn(
  input: Readonly<{ column: CteItemColumnKey; left: string; right: string }>,
): number {
  return NUMERIC_COLUMNS.includes(input.column)
    ? compareScaledAmounts(input.left, input.right)
    : input.left.localeCompare(input.right, 'pt-BR')
}
