/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useMemo, useRef, useState } from 'react'

import type { NfeDocumentListItem } from '../shared/nfeWorkspaceClient.service'

export type DocumentStatus = NfeDocumentListItem['status']

export type TextFilterField =
  | 'emitterAddress'
  | 'emitterName'
  | 'recipientAddress'
  | 'recipientName'

export type SelectFilterField =
  | 'cteIssued'
  | 'emitterCity'
  | 'emitterState'
  | 'recipientCity'
  | 'recipientState'
  | 'status'

export type AmountOperator = 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'neq'

export type FilterKey = SelectFilterField | TextFilterField | 'amount' | 'dateRange' | 'numberRange'

export type FilterMode = 'advanced' | 'simple'

export type FieldType = 'amount' | 'date' | 'number' | 'select' | 'text'

export type ConditionField =
  | 'cteIssued'
  | 'emitterAddress'
  | 'emitterCity'
  | 'emitterName'
  | 'emitterState'
  | 'issuedAt'
  | 'number'
  | 'recipientAddress'
  | 'recipientCity'
  | 'recipientName'
  | 'recipientState'
  | 'series'
  | 'status'
  | 'totalAmount'

export type ConditionOperator =
  | 'after'
  | 'before'
  | 'between'
  | 'contains'
  | 'eq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'neq'
  | 'notContains'

export type GroupConnector = 'and' | 'or'

export type FilterCondition = Readonly<{
  field: ConditionField
  id: string
  operator: ConditionOperator
  value: string
  valueTo: string
}>

export type FilterGroup = Readonly<{
  conditions: readonly FilterCondition[]
  connector: GroupConnector
  id: string
}>

export type AdvancedFilterModel = Readonly<{
  connector: GroupConnector
  groups: readonly FilterGroup[]
}>

export type ConditionChanges = Partial<
  Pick<FilterCondition, 'field' | 'operator' | 'value' | 'valueTo'>
>

export type ColumnKey =
  | 'amount'
  | 'emitter'
  | 'emitterLocation'
  | 'issuedAt'
  | 'number'
  | 'recipient'
  | 'recipientLocation'
  | 'series'
  | 'status'

export type SortColumn =
  | 'amount'
  | 'emitter'
  | 'issuedAt'
  | 'number'
  | 'recipient'
  | 'series'
  | 'status'

export type SortDirection = 'asc' | 'desc'
export type SortState = Readonly<{ column: SortColumn; direction: SortDirection }> | null

export type DocumentFilters = Readonly<{
  amountOperator: AmountOperator
  amountValue: string
  dateFrom: string
  dateTo: string
  numberFrom: string
  numberTo: string
  select: Readonly<Record<SelectFilterField, string>>
  text: Readonly<Record<TextFilterField, string>>
}>

export const TEXT_FILTER_FIELDS: readonly TextFilterField[] = [
  'emitterName',
  'emitterAddress',
  'recipientName',
  'recipientAddress',
]

export const AMOUNT_OPERATORS: readonly AmountOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte']

export const AMOUNT_OPERATOR_SYMBOL: Readonly<Record<AmountOperator, string>> = {
  eq: '=',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  neq: '≠',
}

export const CONDITION_FIELDS: readonly ConditionField[] = [
  'number',
  'cteIssued',
  'series',
  'issuedAt',
  'emitterName',
  'emitterAddress',
  'emitterCity',
  'emitterState',
  'recipientName',
  'recipientAddress',
  'recipientCity',
  'recipientState',
  'totalAmount',
  'status',
]

export const CONDITION_FIELD_TYPE: Readonly<Record<ConditionField, FieldType>> = {
  cteIssued: 'select',
  emitterAddress: 'text',
  emitterCity: 'select',
  emitterName: 'text',
  emitterState: 'select',
  issuedAt: 'date',
  number: 'number',
  recipientAddress: 'text',
  recipientCity: 'select',
  recipientName: 'text',
  recipientState: 'select',
  series: 'number',
  status: 'select',
  totalAmount: 'amount',
}

export const OPERATORS_BY_TYPE: Readonly<Record<FieldType, readonly ConditionOperator[]>> = {
  amount: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  date: ['between', 'before', 'after', 'eq'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  select: ['eq', 'neq'],
  text: ['contains', 'notContains', 'eq', 'neq'],
}

const DEFAULT_OPERATOR: Readonly<Record<FieldType, ConditionOperator>> = {
  amount: 'eq',
  date: 'between',
  number: 'eq',
  select: 'eq',
  text: 'contains',
}

const DEFAULT_CONDITION_FIELD: ConditionField = 'emitterName'
const COLUMN_CONFIG_STORAGE_KEY = 'nfe-workspace.documents.columns.v1'

export const DOCUMENT_COLUMN_KEYS: readonly ColumnKey[] = [
  'number',
  'series',
  'issuedAt',
  'emitter',
  'emitterLocation',
  'recipient',
  'recipientLocation',
  'amount',
  'status',
]

export const PAGE_SIZE_OPTIONS: readonly number[] = [25, 50, 100, 500, 1000]

export const DEFAULT_PAGE_SIZE = 25

export const SORT_COLUMNS: readonly SortColumn[] = [
  'number',
  'series',
  'issuedAt',
  'emitter',
  'recipient',
  'amount',
  'status',
]

const EMPTY_TEXT: Record<TextFilterField, string> = {
  emitterAddress: '',
  emitterName: '',
  recipientAddress: '',
  recipientName: '',
}

/** The workspace opens on the notas still waiting for a CT-e, the only ones a batch can take. */
export const CTE_ISSUED_PENDING = 'pending'

export const CTE_ISSUED_DONE = 'issued'

export const CTE_ISSUED_FILTER_VALUES: readonly string[] = [CTE_ISSUED_PENDING, CTE_ISSUED_DONE]

const CTE_ALREADY_LINKED_REASON = 'CTE_BATCH_DOCUMENT_ALREADY_LINKED'

const EMPTY_SELECT: Record<SelectFilterField, string> = {
  cteIssued: CTE_ISSUED_PENDING,
  emitterCity: '',
  emitterState: '',
  recipientCity: '',
  recipientState: '',
  status: '',
}

export const EMPTY_FILTERS: DocumentFilters = {
  amountOperator: 'gte',
  amountValue: '',
  dateFrom: '',
  dateTo: '',
  numberFrom: '',
  numberTo: '',
  select: EMPTY_SELECT,
  text: EMPTY_TEXT,
}

export const DEFAULT_SORT: SortState = { column: 'number', direction: 'asc' }

export const ALL_COLUMNS_VISIBLE: Record<ColumnKey, boolean> = {
  amount: true,
  emitter: true,
  emitterLocation: true,
  issuedAt: true,
  number: true,
  recipient: true,
  recipientLocation: true,
  series: true,
  status: true,
}

export type TableViewPreferences = Readonly<{
  columnOrder: readonly ColumnKey[]
  columnVisibility: Record<ColumnKey, boolean>
  filters: DocumentFilters
  pageSize: number
  savedAdvancedFilter: AdvancedFilterModel | null
  sort: SortState
}>

export type TableViewPreferencesController = Readonly<{
  initial: TableViewPreferences
  onChange: (preferences: TableViewPreferences) => void
  remote: TableViewPreferences | null
}>

type UseNfeDocumentTableParams = Readonly<{
  documents: readonly NfeDocumentListItem[]
  preferences?: TableViewPreferencesController
  statusLabels: Readonly<Record<DocumentStatus, string>>
}>

export type UseNfeDocumentTableResult = Readonly<{
  activeConditionCount: number
  addCondition: (groupId: string) => void
  addGroup: () => void
  advancedFilter: AdvancedFilterModel
  allSelected: boolean
  blockedCount: number
  cityOptions: Readonly<Record<'emitterCity' | 'recipientCity', readonly string[]>>
  clearAllFilters: () => void
  clearFilter: (key: FilterKey) => void
  clearSavedAdvancedFilter: () => void
  clearSelection: () => void
  columnOrder: readonly ColumnKey[]
  editSavedAdvancedFilter: () => void
  filters: DocumentFilters
  hasActiveFilters: boolean
  isColumnVisible: (column: ColumnKey) => boolean
  mode: FilterMode
  moveColumn: (column: ColumnKey, direction: 'down' | 'up') => void
  pageCount: number
  pageItems: readonly NfeDocumentListItem[]
  pageSize: number
  rangeEnd: number
  rangeStart: number
  removeCondition: (groupId: string, conditionId: string) => void
  removeGroup: (groupId: string) => void
  safePage: number
  saveAdvancedFilter: () => void
  savedConditionCount: number
  searchTerm: string
  selectedCount: number
  selectedIds: ReadonlySet<string>
  setAmountOperator: (operator: AmountOperator) => void
  setAmountValue: (value: string) => void
  setDateRange: (from: string, to: string) => void
  setGroupConnector: (groupId: string, connector: GroupConnector) => void
  setMode: (mode: FilterMode) => void
  setNumberFrom: (value: string) => void
  setNumberTo: (value: string) => void
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  setRootConnector: (connector: GroupConnector) => void
  setSearchTerm: (value: string) => void
  setSelectFilter: (field: SelectFilterField, value: string) => void
  setTextFilter: (field: TextFilterField, value: string) => void
  someSelected: boolean
  sort: SortState
  stateOptions: Readonly<Record<'emitterState' | 'recipientState', readonly string[]>>
  toggleColumn: (column: ColumnKey) => void
  toggleRow: (id: string) => void
  toggleSelectAll: () => void
  toggleSort: (column: SortColumn) => void
  totalFiltered: number
  updateCondition: (groupId: string, conditionId: string, changes: ConditionChanges) => void
  visibleSelected: () => readonly NfeDocumentListItem[]
}>

function distinctSorted(values: readonly (string | null)[]): readonly string[] {
  const unique = new Set<string>()
  for (const value of values) {
    if (value !== null && value.trim().length > 0) unique.add(value)
  }
  return [...unique].sort((first, second) => first.localeCompare(second, 'pt-BR'))
}

function matchesText(value: string, filter: string): boolean {
  return value.toLowerCase().includes(filter.trim().toLowerCase())
}

function matchesNumberRange(rawNumber: string, from: string, to: string): boolean {
  const value = Number(rawNumber)
  if (from.trim().length > 0 && value < Number(from)) return false
  if (to.trim().length > 0 && value > Number(to)) return false
  return true
}

function matchesAmount(rawAmount: string, operator: AmountOperator, target: string): boolean {
  if (target.trim().length === 0) return true
  const value = Number(rawAmount)
  const bound = Number(target)
  if (Number.isNaN(value) || Number.isNaN(bound)) return false
  if (operator === 'eq') return value === bound
  if (operator === 'neq') return value !== bound
  if (operator === 'gt') return value > bound
  if (operator === 'gte') return value >= bound
  if (operator === 'lt') return value < bound
  return value <= bound
}

function matchesDateRange(issuedAt: string, from: string, to: string): boolean {
  const day = issuedAt.slice(0, 10)
  if (from.length > 0 && day < from) return false
  if (to.length > 0 && day > to) return false
  return true
}

function matchesSelect(
  document: NfeDocumentListItem,
  field: SelectFilterField,
  value: string,
): boolean {
  if (value.length === 0) return true
  if (field === 'cteIssued') return cteIssuedValue(document) === value
  if (field === 'status') return document.status === value
  return document[field] === value
}

function documentMatchesFilters(document: NfeDocumentListItem, filters: DocumentFilters): boolean {
  for (const field of TEXT_FILTER_FIELDS) {
    if (!matchesText(document[field] ?? '', filters.text[field])) return false
  }
  for (const field of Object.keys(filters.select) as SelectFilterField[]) {
    if (!matchesSelect(document, field, filters.select[field])) return false
  }
  if (!matchesNumberRange(document.number, filters.numberFrom, filters.numberTo)) return false
  if (!matchesAmount(document.totalAmount, filters.amountOperator, filters.amountValue))
    return false
  if (!matchesDateRange(document.issuedAt, filters.dateFrom, filters.dateTo)) return false
  return true
}

function documentMatchesSearch(document: NfeDocumentListItem, term: string): boolean {
  const needle = term.trim().toLowerCase()
  if (needle.length === 0) return true
  const haystack: readonly (string | null)[] = [
    document.number,
    document.series,
    document.emitterName,
    document.emitterAddress,
    document.emitterCity,
    document.emitterState,
    document.recipientName,
    document.recipientAddress,
    document.recipientCity,
    document.recipientState,
    document.totalAmount,
    document.status,
  ]
  return haystack.some((value) => (value ?? '').toLowerCase().includes(needle))
}

export function hasAnyActiveFilter(filters: DocumentFilters): boolean {
  const textActive = TEXT_FILTER_FIELDS.some((field) => filters.text[field].trim().length > 0)
  const selectActive = (Object.keys(filters.select) as SelectFilterField[]).some(
    (field) => filters.select[field] !== EMPTY_FILTERS.select[field],
  )
  const rangeActive =
    filters.numberFrom.trim().length > 0 ||
    filters.numberTo.trim().length > 0 ||
    filters.amountValue.trim().length > 0 ||
    filters.dateFrom.length > 0 ||
    filters.dateTo.length > 0
  return textActive || selectActive || rangeActive
}

function conditionFieldRaw(document: NfeDocumentListItem, field: ConditionField): string {
  if (field === 'cteIssued') return cteIssuedValue(document)
  if (field === 'issuedAt') return document.issuedAt.slice(0, 10)
  return document[field] ?? ''
}

function conditionHasValue(condition: FilterCondition): boolean {
  if (condition.operator === 'between') {
    return condition.value.length > 0 || condition.valueTo.length > 0
  }
  return condition.value.trim().length > 0
}

function evaluateTextCondition(raw: string, operator: ConditionOperator, value: string): boolean {
  const haystack = raw.toLowerCase()
  const needle = value.trim().toLowerCase()
  if (operator === 'contains') return haystack.includes(needle)
  if (operator === 'notContains') return !haystack.includes(needle)
  if (operator === 'eq') return haystack === needle
  return haystack !== needle
}

function evaluateNumericCondition(
  raw: string,
  operator: ConditionOperator,
  value: string,
): boolean {
  const left = Number(raw)
  const right = Number(value)
  if (Number.isNaN(left) || Number.isNaN(right)) return false
  if (operator === 'eq') return left === right
  if (operator === 'neq') return left !== right
  if (operator === 'gt') return left > right
  if (operator === 'gte') return left >= right
  if (operator === 'lt') return left < right
  return left <= right
}

function evaluateDateCondition(
  raw: string,
  operator: ConditionOperator,
  value: string,
  valueTo: string,
): boolean {
  if (operator === 'between') {
    if (value.length > 0 && raw < value) return false
    if (valueTo.length > 0 && raw > valueTo) return false
    return true
  }
  if (operator === 'before') return raw < value
  if (operator === 'after') return raw > value
  return raw === value
}

function evaluateSelectCondition(raw: string, operator: ConditionOperator, value: string): boolean {
  return operator === 'neq' ? raw !== value : raw === value
}

function evaluateCondition(document: NfeDocumentListItem, condition: FilterCondition): boolean {
  const type = CONDITION_FIELD_TYPE[condition.field]
  const raw = conditionFieldRaw(document, condition.field)
  if (type === 'text') return evaluateTextCondition(raw, condition.operator, condition.value)
  if (type === 'number' || type === 'amount') {
    return evaluateNumericCondition(raw, condition.operator, condition.value)
  }
  if (type === 'date') {
    return evaluateDateCondition(raw, condition.operator, condition.value, condition.valueTo)
  }
  return evaluateSelectCondition(raw, condition.operator, condition.value)
}

function evaluateGroup(document: NfeDocumentListItem, group: FilterGroup): boolean {
  const active = group.conditions.filter(conditionHasValue)
  if (active.length === 0) return true
  if (group.connector === 'and') {
    return active.every((condition) => evaluateCondition(document, condition))
  }
  return active.some((condition) => evaluateCondition(document, condition))
}

export function evaluateAdvancedFilter(
  document: NfeDocumentListItem,
  model: AdvancedFilterModel,
): boolean {
  const active = model.groups.filter((group) => group.conditions.some(conditionHasValue))
  if (active.length === 0) return true
  if (model.connector === 'and') return active.every((group) => evaluateGroup(document, group))
  return active.some((group) => evaluateGroup(document, group))
}

export function documentMatchesSimpleMode(
  document: NfeDocumentListItem,
  filters: DocumentFilters,
  savedAdvancedFilter: AdvancedFilterModel | null,
): boolean {
  if (!documentMatchesFilters(document, filters)) return false
  if (savedAdvancedFilter === null) return true
  return evaluateAdvancedFilter(document, savedAdvancedFilter)
}

export function countActiveConditions(model: AdvancedFilterModel): number {
  return model.groups.reduce(
    (total, group) => total + group.conditions.filter(conditionHasValue).length,
    0,
  )
}

export function reorderColumns(
  order: readonly ColumnKey[],
  column: ColumnKey,
  direction: 'down' | 'up',
): readonly ColumnKey[] {
  const index = order.indexOf(column)
  if (index < 0) return order
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= order.length) return order
  const next = [...order]
  const moved = next[index]
  const swapped = next[target]
  if (moved === undefined || swapped === undefined) return order
  next[index] = swapped
  next[target] = moved
  return next
}

/** A nota only counts as issued when it is tied to a batch that was not cancelled. */
export function isCteIssued(document: NfeDocumentListItem): boolean {
  return document.cteBlockReason === CTE_ALREADY_LINKED_REASON
}

function cteIssuedValue(document: NfeDocumentListItem): string {
  return isCteIssued(document) ? CTE_ISSUED_DONE : CTE_ISSUED_PENDING
}

/** The API already resolved the block, so the table never re-derives the fiscal rule. */
export function isDocumentBlocked(document: NfeDocumentListItem): boolean {
  return document.cteBlockReason !== null
}

export function countBlockedDocuments(documents: readonly NfeDocumentListItem[]): number {
  return documents.filter(isDocumentBlocked).length
}

export function toggleDocumentSelection({
  documentId,
  documents,
  selectedIds,
}: {
  readonly documentId: string
  readonly documents: readonly NfeDocumentListItem[]
  readonly selectedIds: ReadonlySet<string>
}): ReadonlySet<string> {
  const document = documents.find((candidate) => candidate.id === documentId)
  if (document !== undefined && isDocumentBlocked(document)) return selectedIds
  return toggleSetValue(selectedIds, documentId)
}

export function toggleAllDocumentSelection({
  allSelected,
  pageItems,
  selectedIds,
}: {
  readonly allSelected: boolean
  readonly pageItems: readonly NfeDocumentListItem[]
  readonly selectedIds: ReadonlySet<string>
}): ReadonlySet<string> {
  const next = new Set(selectedIds)
  for (const item of pageItems) {
    if (isDocumentBlocked(item)) continue
    if (allSelected) next.delete(item.id)
    else next.add(item.id)
  }
  return next
}

function compareByColumn(
  column: SortColumn,
  first: NfeDocumentListItem,
  second: NfeDocumentListItem,
): number {
  if (column === 'emitter') return first.emitterName.localeCompare(second.emitterName, 'pt-BR')
  if (column === 'recipient') {
    return first.recipientName.localeCompare(second.recipientName, 'pt-BR')
  }
  if (column === 'amount') return Number(first.totalAmount) - Number(second.totalAmount)
  if (column === 'number') return Number(first.number) - Number(second.number)
  if (column === 'series') return Number(first.series) - Number(second.series)
  if (column === 'issuedAt') return first.issuedAt.localeCompare(second.issuedAt)
  return first.status.localeCompare(second.status)
}

function nextSort(current: SortState, column: SortColumn): SortState {
  if (current === null || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}

function toggleSetValue<TValue>(source: ReadonlySet<TValue>, value: TValue): Set<TValue> {
  const next = new Set(source)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

type ColumnConfig = Readonly<{
  order: readonly ColumnKey[]
  visibility: Readonly<Record<ColumnKey, boolean>>
}>

export function sanitizeColumnOrder(order: readonly unknown[]): readonly ColumnKey[] {
  const known = new Set<ColumnKey>(DOCUMENT_COLUMN_KEYS)
  const seen = new Set<ColumnKey>()
  const result: ColumnKey[] = []
  for (const value of order) {
    if (
      typeof value === 'string' &&
      known.has(value as ColumnKey) &&
      !seen.has(value as ColumnKey)
    ) {
      seen.add(value as ColumnKey)
      result.push(value as ColumnKey)
    }
  }
  for (const column of DOCUMENT_COLUMN_KEYS) {
    if (!seen.has(column)) result.push(column)
  }
  return result
}

export function sanitizeColumnVisibility(raw: unknown): Record<ColumnKey, boolean> {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const visibility = { ...ALL_COLUMNS_VISIBLE }
  for (const column of DOCUMENT_COLUMN_KEYS) {
    if (typeof source[column] === 'boolean') visibility[column] = source[column]
  }
  return visibility
}

function loadColumnConfig(): ColumnConfig {
  const fallback: ColumnConfig = { order: DOCUMENT_COLUMN_KEYS, visibility: ALL_COLUMNS_VISIBLE }
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(COLUMN_CONFIG_STORAGE_KEY)
    if (raw === null) return fallback
    const parsed = JSON.parse(raw) as { order?: unknown; visibility?: unknown }
    return {
      order: sanitizeColumnOrder(Array.isArray(parsed.order) ? parsed.order : []),
      visibility: sanitizeColumnVisibility(parsed.visibility),
    }
  } catch {
    return fallback
  }
}

function persistColumnConfig(config: ColumnConfig): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(COLUMN_CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Ignore storage failures (private mode / quota) — column config is non-critical.
  }
}

function createCondition(id: string): FilterCondition {
  return { field: DEFAULT_CONDITION_FIELD, id, operator: 'contains', value: '', valueTo: '' }
}

function createInitialAdvancedFilter(nextId: () => string): AdvancedFilterModel {
  return {
    connector: 'and',
    groups: [{ conditions: [createCondition(nextId())], connector: 'and', id: nextId() }],
  }
}

export function useNfeDocumentTable({
  documents,
  preferences,
}: UseNfeDocumentTableParams): UseNfeDocumentTableResult {
  const idRef = useRef(0)
  const nextId = (): string => {
    idRef.current += 1
    return `f${String(idRef.current)}`
  }
  const seed = preferences?.initial
  const [filters, setFilters] = useState<DocumentFilters>(seed?.filters ?? EMPTY_FILTERS)
  const [searchTerm, setSearchTermState] = useState('')
  const [mode, setModeState] = useState<FilterMode>('simple')
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFilterModel>(() =>
    createInitialAdvancedFilter(nextId),
  )
  const [savedAdvancedFilter, setSavedAdvancedFilter] = useState<AdvancedFilterModel | null>(
    seed === undefined ? null : seed.savedAdvancedFilter,
  )
  const [sort, setSort] = useState<SortState>(seed === undefined ? DEFAULT_SORT : seed.sort)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const initialColumnConfig = useState<ColumnConfig>(loadColumnConfig)[0]
  const [columnOrder, setColumnOrder] = useState<readonly ColumnKey[]>(
    seed?.columnOrder ?? initialColumnConfig.order,
  )
  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnKey, boolean>>(
    seed?.columnVisibility ?? initialColumnConfig.visibility,
  )
  const [pageSize, setPageSizeState] = useState<number>(seed?.pageSize ?? DEFAULT_PAGE_SIZE)
  const [page, setPageState] = useState(0)

  const currentView = useMemo<TableViewPreferences>(
    () => ({ columnOrder, columnVisibility, filters, pageSize, savedAdvancedFilter, sort }),
    [columnOrder, columnVisibility, filters, pageSize, savedAdvancedFilter, sort],
  )
  const onChangeRef = useRef(preferences?.onChange)
  onChangeRef.current = preferences?.onChange
  const isSeedEffectRef = useRef(true)
  const suppressPersistRef = useRef(false)
  const hasEditedRef = useRef(false)
  const hasHydratedRemoteRef = useRef(false)
  const remotePreferences = preferences?.remote ?? null

  useEffect(() => {
    if (preferences !== undefined) return
    persistColumnConfig({ order: columnOrder, visibility: columnVisibility })
  }, [columnOrder, columnVisibility, preferences])

  useEffect(() => {
    const onChange = onChangeRef.current
    if (onChange === undefined) return
    if (isSeedEffectRef.current) {
      isSeedEffectRef.current = false
      return
    }
    if (suppressPersistRef.current) {
      suppressPersistRef.current = false
      return
    }
    hasEditedRef.current = true
    onChange(currentView)
  }, [currentView])

  useEffect(() => {
    if (remotePreferences === null || hasHydratedRemoteRef.current) return
    hasHydratedRemoteRef.current = true
    if (hasEditedRef.current) return
    suppressPersistRef.current = true
    setFilters(remotePreferences.filters)
    setSavedAdvancedFilter(remotePreferences.savedAdvancedFilter)
    setSort(remotePreferences.sort)
    setColumnOrder(remotePreferences.columnOrder)
    setColumnVisibility(remotePreferences.columnVisibility)
    setPageSizeState(remotePreferences.pageSize)
    setPageState(0)
  }, [remotePreferences])

  const cityOptions = useMemo(
    () => ({
      emitterCity: distinctSorted(documents.map((document) => document.emitterCity)),
      recipientCity: distinctSorted(documents.map((document) => document.recipientCity)),
    }),
    [documents],
  )

  const stateOptions = useMemo(
    () => ({
      emitterState: distinctSorted(documents.map((document) => document.emitterState)),
      recipientState: distinctSorted(documents.map((document) => document.recipientState)),
    }),
    [documents],
  )

  const filtered = useMemo(() => {
    const byMode =
      mode === 'advanced'
        ? documents.filter((document) => evaluateAdvancedFilter(document, advancedFilter))
        : documents.filter((document) =>
            documentMatchesSimpleMode(document, filters, savedAdvancedFilter),
          )
    if (searchTerm.trim().length === 0) return byMode
    return byMode.filter((document) => documentMatchesSearch(document, searchTerm))
  }, [advancedFilter, documents, filters, mode, savedAdvancedFilter, searchTerm])

  const sorted = useMemo(() => {
    if (sort === null) return filtered
    return [...filtered].sort((first, second) => {
      const base = compareByColumn(sort.column, first, second)
      return sort.direction === 'asc' ? base : -base
    })
  }, [filtered, sort])

  const totalFiltered = sorted.length
  const pageCount = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const pageStart = safePage * pageSize
  const pageItems = sorted.slice(pageStart, pageStart + pageSize)
  const rangeStart = totalFiltered === 0 ? 0 : pageStart + 1
  const rangeEnd = Math.min(pageStart + pageSize, totalFiltered)

  const selectablePageItems = pageItems.filter((item) => !isDocumentBlocked(item))
  const selectedOnPage = selectablePageItems.filter((item) => selectedIds.has(item.id)).length
  const allSelected =
    selectablePageItems.length > 0 && selectedOnPage === selectablePageItems.length
  const someSelected = selectedOnPage > 0 && !allSelected
  const blockedCount = countBlockedDocuments(pageItems)
  const isDefaultSort =
    sort !== null &&
    sort.column === DEFAULT_SORT?.column &&
    sort.direction === DEFAULT_SORT?.direction
  const activeConditionCount = countActiveConditions(advancedFilter)
  const savedConditionCount =
    savedAdvancedFilter === null ? 0 : countActiveConditions(savedAdvancedFilter)
  const filterActive =
    mode === 'advanced'
      ? activeConditionCount > 0
      : hasAnyActiveFilter(filters) || savedConditionCount > 0
  const searchActive = searchTerm.trim().length > 0
  const hasActiveFilters = filterActive || searchActive || !isDefaultSort

  function setTextFilter(field: TextFilterField, value: string): void {
    setFilters((current) => ({ ...current, text: { ...current.text, [field]: value } }))
    setPageState(0)
  }

  function setSelectFilter(field: SelectFilterField, value: string): void {
    setFilters((current) => ({ ...current, select: { ...current.select, [field]: value } }))
    setPageState(0)
  }

  function setNumberFrom(value: string): void {
    setFilters((current) => ({ ...current, numberFrom: value }))
    setPageState(0)
  }

  function setNumberTo(value: string): void {
    setFilters((current) => ({ ...current, numberTo: value }))
    setPageState(0)
  }

  function setAmountOperator(operator: AmountOperator): void {
    setFilters((current) => ({ ...current, amountOperator: operator }))
    setPageState(0)
  }

  function setAmountValue(value: string): void {
    setFilters((current) => ({ ...current, amountValue: value }))
    setPageState(0)
  }

  function setDateRange(from: string, to: string): void {
    setFilters((current) => ({ ...current, dateFrom: from, dateTo: to }))
    setPageState(0)
  }

  function clearFilter(key: FilterKey): void {
    setFilters((current) => {
      if (key === 'numberRange') return { ...current, numberFrom: '', numberTo: '' }
      if (key === 'amount') return { ...current, amountValue: '' }
      if (key === 'dateRange') return { ...current, dateFrom: '', dateTo: '' }
      if (key in current.select) {
        const field = key as SelectFilterField
        return { ...current, select: { ...current.select, [field]: EMPTY_FILTERS.select[field] } }
      }
      return { ...current, text: { ...current.text, [key]: '' } }
    })
    setPageState(0)
  }

  function clearAllFilters(): void {
    setFilters(EMPTY_FILTERS)
    setAdvancedFilter(createInitialAdvancedFilter(nextId))
    setSavedAdvancedFilter(null)
    setSearchTermState('')
    setSort(DEFAULT_SORT)
    setPageState(0)
  }

  function saveAdvancedFilter(): void {
    if (countActiveConditions(advancedFilter) === 0) return
    setSavedAdvancedFilter(advancedFilter)
    setModeState('simple')
    setPageState(0)
  }

  function editSavedAdvancedFilter(): void {
    if (savedAdvancedFilter !== null) setAdvancedFilter(savedAdvancedFilter)
    setModeState('advanced')
    setPageState(0)
  }

  function clearSavedAdvancedFilter(): void {
    setSavedAdvancedFilter(null)
    setPageState(0)
  }

  function setSearchTerm(value: string): void {
    setSearchTermState(value)
    setPageState(0)
  }

  function setMode(next: FilterMode): void {
    setModeState(next)
    setPageState(0)
  }

  function setRootConnector(connector: GroupConnector): void {
    setAdvancedFilter((current) => ({ ...current, connector }))
    setPageState(0)
  }

  function addGroup(): void {
    setAdvancedFilter((current) => ({
      ...current,
      groups: [
        ...current.groups,
        { conditions: [createCondition(nextId())], connector: 'and', id: nextId() },
      ],
    }))
  }

  function removeGroup(groupId: string): void {
    setAdvancedFilter((current) => {
      if (current.groups.length <= 1) return current
      return { ...current, groups: current.groups.filter((group) => group.id !== groupId) }
    })
    setPageState(0)
  }

  function setGroupConnector(groupId: string, connector: GroupConnector): void {
    setAdvancedFilter((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId ? { ...group, connector } : group,
      ),
    }))
    setPageState(0)
  }

  function addCondition(groupId: string): void {
    setAdvancedFilter((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? { ...group, conditions: [...group.conditions, createCondition(nextId())] }
          : group,
      ),
    }))
  }

  function removeCondition(groupId: string, conditionId: string): void {
    setAdvancedFilter((current) => ({
      ...current,
      groups: current.groups.map((group) => {
        if (group.id !== groupId) return group
        if (group.conditions.length <= 1) return group
        return {
          ...group,
          conditions: group.conditions.filter((condition) => condition.id !== conditionId),
        }
      }),
    }))
    setPageState(0)
  }

  function updateCondition(groupId: string, conditionId: string, changes: ConditionChanges): void {
    setAdvancedFilter((current) => ({
      ...current,
      groups: current.groups.map((group) => {
        if (group.id !== groupId) return group
        return {
          ...group,
          conditions: group.conditions.map((condition) => {
            if (condition.id !== conditionId) return condition
            let next: FilterCondition = { ...condition, ...changes }
            if (changes.field !== undefined && changes.field !== condition.field) {
              const type = CONDITION_FIELD_TYPE[changes.field]
              next = { ...next, operator: DEFAULT_OPERATOR[type], value: '', valueTo: '' }
            }
            if (changes.operator !== undefined && changes.operator !== 'between') {
              next = { ...next, valueTo: '' }
            }
            return next
          }),
        }
      }),
    }))
    setPageState(0)
  }

  function moveColumn(column: ColumnKey, direction: 'down' | 'up'): void {
    setColumnOrder((current) => reorderColumns(current, column, direction))
  }

  function toggleSort(column: SortColumn): void {
    setSort((current) => nextSort(current, column))
  }

  function toggleRow(id: string): void {
    setSelectedIds((current) =>
      toggleDocumentSelection({ documentId: id, documents: pageItems, selectedIds: current }),
    )
  }

  function toggleSelectAll(): void {
    setSelectedIds((current) =>
      toggleAllDocumentSelection({ allSelected, pageItems, selectedIds: current }),
    )
  }

  function clearSelection(): void {
    setSelectedIds(new Set())
  }

  function toggleColumn(column: ColumnKey): void {
    setColumnVisibility((current) => ({ ...current, [column]: !current[column] }))
  }

  function isColumnVisible(column: ColumnKey): boolean {
    return columnVisibility[column]
  }

  function visibleSelected(): readonly NfeDocumentListItem[] {
    return filtered.filter((item) => selectedIds.has(item.id))
  }

  function setPage(next: number): void {
    setPageState(Math.max(0, Math.min(next, pageCount - 1)))
  }

  function setPageSize(size: number): void {
    setPageSizeState(size)
    setPageState(0)
  }

  return {
    activeConditionCount,
    addCondition,
    addGroup,
    advancedFilter,
    allSelected,
    blockedCount,
    cityOptions,
    clearAllFilters,
    clearFilter,
    clearSavedAdvancedFilter,
    clearSelection,
    columnOrder,
    editSavedAdvancedFilter,
    filters,
    hasActiveFilters,
    isColumnVisible,
    mode,
    moveColumn,
    pageCount,
    pageItems,
    pageSize,
    rangeEnd,
    rangeStart,
    removeCondition,
    removeGroup,
    safePage,
    saveAdvancedFilter,
    savedConditionCount,
    searchTerm,
    selectedCount: selectedIds.size,
    selectedIds,
    setAmountOperator,
    setAmountValue,
    setDateRange,
    setGroupConnector,
    setMode,
    setNumberFrom,
    setNumberTo,
    setPage,
    setPageSize,
    setRootConnector,
    setSearchTerm,
    setSelectFilter,
    setTextFilter,
    someSelected,
    sort,
    stateOptions,
    toggleColumn,
    toggleRow,
    toggleSelectAll,
    toggleSort,
    totalFiltered,
    updateCondition,
    visibleSelected,
  }
}
