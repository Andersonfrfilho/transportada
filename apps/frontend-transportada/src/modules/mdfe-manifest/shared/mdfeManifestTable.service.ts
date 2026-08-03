/* Copyright (c) 2026 Ada Technology. MIT License. */
import { MDFE_MANIFEST_STATUS } from './mdfeManifest.types'
import type { MdfeManifestStatus, MdfeManifestSummary } from './mdfeManifest.types'

export const MDFE_MANIFEST_STATUSES: readonly MdfeManifestStatus[] = MDFE_MANIFEST_STATUS

export const MDFE_MANIFEST_COLUMN_KEYS = [
  'fiscalNumber',
  'status',
  'vehicleId',
  'originState',
  'destinationState',
  'cteCount',
  'cargoValue',
  'cargoWeight',
  'createdAt',
  'updatedAt',
] as const

export type MdfeManifestColumnKey = (typeof MDFE_MANIFEST_COLUMN_KEYS)[number]

export const MDFE_MANIFEST_COLUMNS_STORAGE_KEY = 'mdfe-manifest.manifests.columns.v1'

export type MdfeManifestSortDirection = 'asc' | 'desc'

export type MdfeManifestSortState = null | Readonly<{
  column: MdfeManifestColumnKey
  direction: MdfeManifestSortDirection
}>

export type MdfeManifestTableFilters = Readonly<{
  createdFrom: string
  createdTo: string
  cteCountFrom: string
  cteCountTo: string
  destinationStates: readonly string[]
  fiscalNumberContains: string
  statuses: readonly MdfeManifestStatus[]
}>

export type MdfeManifestColumnPreferences = Readonly<{
  order: readonly MdfeManifestColumnKey[]
  visibility: Readonly<Record<MdfeManifestColumnKey, boolean>>
}>

export type MdfeManifestColumnStorage = Readonly<{
  getItem: (key: string) => null | string
  setItem: (key: string, value: string) => void
}>

export const EMPTY_MDFE_MANIFEST_FILTERS: MdfeManifestTableFilters = {
  createdFrom: '',
  createdTo: '',
  cteCountFrom: '',
  cteCountTo: '',
  destinationStates: [],
  fiscalNumberContains: '',
  statuses: [],
}

const NUMERIC_COLUMNS: readonly MdfeManifestColumnKey[] = ['cargoValue', 'cargoWeight', 'cteCount']

const REJECTION_SEPARATOR = ' · '

function isColumnKey(value: unknown): value is MdfeManifestColumnKey {
  return MDFE_MANIFEST_COLUMN_KEYS.some((column) => column === value)
}

function defaultVisibility(): Record<MdfeManifestColumnKey, boolean> {
  return {
    cargoValue: true,
    cargoWeight: true,
    createdAt: true,
    cteCount: true,
    destinationState: true,
    fiscalNumber: true,
    originState: true,
    status: true,
    updatedAt: true,
    vehicleId: true,
  }
}

function toDay(value: string): string {
  return value.slice(0, 10)
}

function readText(manifest: MdfeManifestSummary, column: MdfeManifestColumnKey): string {
  const value = manifest[column]
  return typeof value === 'string' ? value : ''
}

function compareValues(
  left: MdfeManifestSummary,
  right: MdfeManifestSummary,
  column: MdfeManifestColumnKey,
): number {
  if (column === 'cteCount') return left.cteCount - right.cteCount
  if (NUMERIC_COLUMNS.includes(column)) {
    return Number(readText(left, column)) - Number(readText(right, column))
  }
  return readText(left, column).localeCompare(readText(right, column), 'pt-BR')
}

/** O texto da SEFAZ não é traduzível: sai como veio, só prefixado pelo código da recusa. */
export function formatManifestRejection(manifest: MdfeManifestSummary): null | string {
  const rejection = manifest.lastRejection
  if (rejection === null) return null
  return rejection.message === null
    ? rejection.code
    : `${rejection.code}${REJECTION_SEPARATOR}${rejection.message}`
}

export function nextSortState(
  current: MdfeManifestSortState,
  column: MdfeManifestColumnKey,
): MdfeManifestSortState {
  if (current === null || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}

export function sortManifests(
  manifests: readonly MdfeManifestSummary[],
  sort: MdfeManifestSortState,
): readonly MdfeManifestSummary[] {
  if (sort === null) return manifests
  const factor = sort.direction === 'asc' ? 1 : -1
  return [...manifests].sort((left, right) => compareValues(left, right, sort.column) * factor)
}

export function countActiveFilters(filters: MdfeManifestTableFilters): number {
  const scalarFields = [
    filters.createdFrom,
    filters.createdTo,
    filters.cteCountFrom,
    filters.cteCountTo,
    filters.fiscalNumberContains,
  ]
  const multiFields = [filters.destinationStates, filters.statuses]
  return (
    scalarFields.filter((field) => field.length > 0).length +
    multiFields.filter((field) => field.length > 0).length
  )
}

export function manifestMatchesFilters(
  manifest: MdfeManifestSummary,
  filters: MdfeManifestTableFilters,
): boolean {
  if (filters.statuses.length > 0 && !filters.statuses.includes(manifest.status)) return false
  if (
    filters.destinationStates.length > 0 &&
    !filters.destinationStates.includes(manifest.destinationState)
  ) {
    return false
  }
  if (filters.fiscalNumberContains.length > 0) {
    if (manifest.fiscalNumber === null) return false
    if (!manifest.fiscalNumber.includes(filters.fiscalNumberContains)) return false
  }
  if (filters.cteCountFrom.length > 0 && manifest.cteCount < Number(filters.cteCountFrom)) {
    return false
  }
  if (filters.cteCountTo.length > 0 && manifest.cteCount > Number(filters.cteCountTo)) return false
  if (filters.createdFrom.length > 0 && toDay(manifest.createdAt) < filters.createdFrom)
    return false
  if (filters.createdTo.length > 0 && toDay(manifest.createdAt) > filters.createdTo) return false
  return true
}

export function reorderColumns(
  order: readonly MdfeManifestColumnKey[],
  column: MdfeManifestColumnKey,
  direction: 'down' | 'up',
): readonly MdfeManifestColumnKey[] {
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

function sanitizeOrder(value: unknown): readonly MdfeManifestColumnKey[] {
  if (!Array.isArray(value)) return MDFE_MANIFEST_COLUMN_KEYS
  const known = value.filter(isColumnKey)
  const unique = known.filter((column, index) => known.indexOf(column) === index)
  return [...unique, ...MDFE_MANIFEST_COLUMN_KEYS.filter((column) => !unique.includes(column))]
}

function sanitizeVisibility(value: unknown): Record<MdfeManifestColumnKey, boolean> {
  const visibility = defaultVisibility()
  if (typeof value !== 'object' || value === null) return visibility
  for (const [key, flag] of Object.entries(value)) {
    if (isColumnKey(key) && typeof flag === 'boolean') visibility[key] = flag
  }
  return visibility
}

export function readColumnPreferences(
  storage: MdfeManifestColumnStorage | null,
): MdfeManifestColumnPreferences {
  const fallback = { order: MDFE_MANIFEST_COLUMN_KEYS, visibility: defaultVisibility() }
  if (storage === null) return fallback
  try {
    const raw = storage.getItem(MDFE_MANIFEST_COLUMNS_STORAGE_KEY)
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
    preferences: MdfeManifestColumnPreferences
    storage: MdfeManifestColumnStorage | null
  }>,
): void {
  if (input.storage === null) return
  try {
    input.storage.setItem(MDFE_MANIFEST_COLUMNS_STORAGE_KEY, JSON.stringify(input.preferences))
  } catch {
    return
  }
}

export function toggleStatusFilter(
  statuses: readonly MdfeManifestStatus[],
  status: MdfeManifestStatus,
): readonly MdfeManifestStatus[] {
  return statuses.includes(status)
    ? statuses.filter((current) => current !== status)
    : [...statuses, status]
}
