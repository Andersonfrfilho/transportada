/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CteBatchStatus, CteBatchSummary } from './cteBatchClient.service'

export const CTE_BATCH_STATUSES: readonly CteBatchStatus[] = [
  'draft',
  'submitted',
  'in_flight',
  'done',
  'error',
  'cancelled',
]

export const CTE_BATCH_COLUMN_KEYS = [
  'name',
  'status',
  'itemCount',
  'createdAt',
  'updatedAt',
  'version',
] as const

export type CteBatchColumnKey = (typeof CTE_BATCH_COLUMN_KEYS)[number]

export const CTE_BATCH_COLUMNS_STORAGE_KEY = 'cte-batch.batches.columns.v1'

export type CteBatchSortDirection = 'asc' | 'desc'

export type CteBatchSortState = null | Readonly<{
  column: CteBatchColumnKey
  direction: CteBatchSortDirection
}>

export type CteBatchTableFilters = Readonly<{
  createdFrom: string
  createdTo: string
  itemCountFrom: string
  itemCountTo: string
  nameContains: string
  statuses: readonly CteBatchStatus[]
}>

export type CteBatchColumnPreferences = Readonly<{
  order: readonly CteBatchColumnKey[]
  visibility: Readonly<Record<CteBatchColumnKey, boolean>>
}>

export type CteBatchColumnStorage = Readonly<{
  getItem: (key: string) => null | string
  setItem: (key: string, value: string) => void
}>

export const EMPTY_CTE_BATCH_FILTERS: CteBatchTableFilters = {
  createdFrom: '',
  createdTo: '',
  itemCountFrom: '',
  itemCountTo: '',
  nameContains: '',
  statuses: [],
}

function isColumnKey(value: unknown): value is CteBatchColumnKey {
  return CTE_BATCH_COLUMN_KEYS.some((column) => column === value)
}

function defaultVisibility(): Record<CteBatchColumnKey, boolean> {
  return {
    createdAt: true,
    itemCount: true,
    name: true,
    status: true,
    updatedAt: true,
    version: true,
  }
}

function toDay(value: string): string {
  return value.slice(0, 10)
}

function compareValues(
  left: CteBatchSummary,
  right: CteBatchSummary,
  column: CteBatchColumnKey,
): number {
  if (column === 'itemCount') return left.itemCount - right.itemCount
  if (column === 'version') return Number(left.version) - Number(right.version)
  return left[column].localeCompare(right[column], 'pt-BR')
}

export function nextSortState(
  current: CteBatchSortState,
  column: CteBatchColumnKey,
): CteBatchSortState {
  if (current === null || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}

export function sortBatches(
  batches: readonly CteBatchSummary[],
  sort: CteBatchSortState,
): readonly CteBatchSummary[] {
  if (sort === null) return batches
  const factor = sort.direction === 'asc' ? 1 : -1
  return [...batches].sort((left, right) => compareValues(left, right, sort.column) * factor)
}

export function countActiveFilters(filters: CteBatchTableFilters): number {
  const scalarFields = [
    filters.createdFrom,
    filters.createdTo,
    filters.itemCountFrom,
    filters.itemCountTo,
    filters.nameContains,
  ]
  return (
    scalarFields.filter((field) => field.length > 0).length + (filters.statuses.length > 0 ? 1 : 0)
  )
}

export function batchMatchesFilters(
  batch: CteBatchSummary,
  filters: CteBatchTableFilters,
): boolean {
  if (filters.statuses.length > 0 && !filters.statuses.includes(batch.status)) return false
  if (
    filters.nameContains.length > 0 &&
    !batch.name.toLocaleLowerCase('pt-BR').includes(filters.nameContains.toLocaleLowerCase('pt-BR'))
  ) {
    return false
  }
  if (filters.itemCountFrom.length > 0 && batch.itemCount < Number(filters.itemCountFrom)) {
    return false
  }
  if (filters.itemCountTo.length > 0 && batch.itemCount > Number(filters.itemCountTo)) return false
  if (filters.createdFrom.length > 0 && toDay(batch.createdAt) < filters.createdFrom) return false
  if (filters.createdTo.length > 0 && toDay(batch.createdAt) > filters.createdTo) return false
  return true
}

export function reorderColumns(
  order: readonly CteBatchColumnKey[],
  column: CteBatchColumnKey,
  direction: 'down' | 'up',
): readonly CteBatchColumnKey[] {
  const index = order.indexOf(column)
  const target = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || target < 0 || target >= order.length) return order
  const reordered = [...order]
  const moved = reordered[index]
  const displaced = reordered[target]
  if (moved === undefined || displaced === undefined) return order
  reordered[index] = displaced
  reordered[target] = moved
  return reordered
}

function sanitizeOrder(value: unknown): readonly CteBatchColumnKey[] {
  if (!Array.isArray(value)) return CTE_BATCH_COLUMN_KEYS
  const known = value.filter(isColumnKey)
  const unique = known.filter((column, index) => known.indexOf(column) === index)
  return [...unique, ...CTE_BATCH_COLUMN_KEYS.filter((column) => !unique.includes(column))]
}

function sanitizeVisibility(value: unknown): Record<CteBatchColumnKey, boolean> {
  const visibility = defaultVisibility()
  if (typeof value !== 'object' || value === null) return visibility
  for (const [key, flag] of Object.entries(value)) {
    if (isColumnKey(key) && typeof flag === 'boolean') visibility[key] = flag
  }
  return visibility
}

export function readColumnPreferences(
  storage: CteBatchColumnStorage | null,
): CteBatchColumnPreferences {
  const fallback = { order: CTE_BATCH_COLUMN_KEYS, visibility: defaultVisibility() }
  if (storage === null) return fallback
  try {
    const raw = storage.getItem(CTE_BATCH_COLUMNS_STORAGE_KEY)
    if (raw === null) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return fallback
    const record = parsed as Record<string, unknown>
    return { order: sanitizeOrder(record.order), visibility: sanitizeVisibility(record.visibility) }
  } catch {
    return fallback
  }
}

export function writeColumnPreferences(
  input: Readonly<{
    preferences: CteBatchColumnPreferences
    storage: CteBatchColumnStorage | null
  }>,
): void {
  if (input.storage === null) return
  try {
    input.storage.setItem(CTE_BATCH_COLUMNS_STORAGE_KEY, JSON.stringify(input.preferences))
  } catch {
    return
  }
}

export function toggleStatusFilter(
  statuses: readonly CteBatchStatus[],
  status: CteBatchStatus,
): readonly CteBatchStatus[] {
  return statuses.includes(status)
    ? statuses.filter((current) => current !== status)
    : [...statuses, status]
}
