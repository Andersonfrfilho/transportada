/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  AMOUNT_OPERATORS,
  CONDITION_FIELDS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  OPERATORS_BY_TYPE,
  PAGE_SIZE_OPTIONS,
  sanitizeColumnOrder,
  sanitizeColumnVisibility,
  SORT_COLUMNS,
  TEXT_FILTER_FIELDS,
} from '../hooks/useNfeDocumentTable.hook.js'
import type {
  AdvancedFilterModel,
  AmountOperator,
  ConditionField,
  ConditionOperator,
  DocumentFilters,
  FilterCondition,
  FilterGroup,
  GroupConnector,
  SelectFilterField,
  SortColumn,
  SortState,
  TableViewPreferences,
} from '../hooks/useNfeDocumentTable.hook.js'

export type { TableViewPreferences }

const SELECT_FILTER_FIELDS = Object.keys(EMPTY_FILTERS.select) as readonly SelectFilterField[]

const CONDITION_OPERATORS = new Set<ConditionOperator>(Object.values(OPERATORS_BY_TYPE).flat())

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function parseStringRecord<TKey extends string>(
  raw: unknown,
  keys: readonly TKey[],
): Record<TKey, string> {
  const source = isRecord(raw) ? raw : {}
  const result = {} as Record<TKey, string>
  for (const key of keys) {
    result[key] = parseString(source[key])
  }
  return result
}

function parseSelectFilters(raw: unknown): Record<SelectFilterField, string> {
  const source = isRecord(raw) ? raw : {}
  const result = {} as Record<SelectFilterField, string>
  for (const field of SELECT_FILTER_FIELDS) {
    const stored = source[field]
    result[field] = typeof stored === 'string' ? stored : EMPTY_FILTERS.select[field]
  }
  return result
}

function parseFilters(raw: unknown): DocumentFilters {
  if (!isRecord(raw)) return EMPTY_FILTERS
  const amountOperator = AMOUNT_OPERATORS.includes(raw.amountOperator as AmountOperator)
    ? (raw.amountOperator as AmountOperator)
    : EMPTY_FILTERS.amountOperator
  return {
    amountOperator,
    amountValue: parseString(raw.amountValue),
    dateFrom: parseString(raw.dateFrom),
    dateTo: parseString(raw.dateTo),
    numberFrom: parseString(raw.numberFrom),
    numberTo: parseString(raw.numberTo),
    select: parseSelectFilters(raw.select),
    text: parseStringRecord(raw.text, TEXT_FILTER_FIELDS),
  }
}

function parseSort(raw: unknown): SortState {
  if (raw === null) return null
  if (!isRecord(raw)) return DEFAULT_SORT
  const { column, direction } = raw
  if (
    typeof column === 'string' &&
    SORT_COLUMNS.includes(column as SortColumn) &&
    (direction === 'asc' || direction === 'desc')
  ) {
    return { column: column as SortColumn, direction }
  }
  return DEFAULT_SORT
}

function parsePageSize(raw: unknown): number {
  return typeof raw === 'number' && PAGE_SIZE_OPTIONS.includes(raw) ? raw : DEFAULT_PAGE_SIZE
}

function parseConnector(raw: unknown): GroupConnector | undefined {
  return raw === 'and' || raw === 'or' ? raw : undefined
}

function parseCondition(raw: unknown): FilterCondition | null {
  if (!isRecord(raw)) return null
  const { field, id, operator } = raw
  if (typeof id !== 'string' || id.length === 0) return null
  if (typeof field !== 'string' || !CONDITION_FIELDS.includes(field as ConditionField)) return null
  if (typeof operator !== 'string' || !CONDITION_OPERATORS.has(operator as ConditionOperator)) {
    return null
  }
  return {
    field: field as ConditionField,
    id,
    operator: operator as ConditionOperator,
    value: parseString(raw.value),
    valueTo: parseString(raw.valueTo),
  }
}

function parseGroup(raw: unknown): FilterGroup | null {
  if (!isRecord(raw)) return null
  const connector = parseConnector(raw.connector)
  if (connector === undefined) return null
  if (typeof raw.id !== 'string' || raw.id.length === 0) return null
  const conditionsRaw = Array.isArray(raw.conditions) ? raw.conditions : []
  const conditions = conditionsRaw
    .map(parseCondition)
    .filter((condition): condition is FilterCondition => condition !== null)
  return { conditions, connector, id: raw.id }
}

function parseSavedAdvancedFilter(raw: unknown): AdvancedFilterModel | null {
  if (!isRecord(raw)) return null
  const connector = parseConnector(raw.connector)
  if (connector === undefined) return null
  const groupsRaw = Array.isArray(raw.groups) ? raw.groups : []
  const groups = groupsRaw.map(parseGroup).filter((group): group is FilterGroup => group !== null)
  return { connector, groups }
}

export function parseTableViewPreferences(raw: unknown): TableViewPreferences {
  const source = isRecord(raw) ? raw : {}
  return {
    columnOrder: sanitizeColumnOrder(Array.isArray(source.columnOrder) ? source.columnOrder : []),
    columnVisibility: sanitizeColumnVisibility(source.columnVisibility),
    filters: parseFilters(source.filters),
    pageSize: parsePageSize(source.pageSize),
    savedAdvancedFilter: parseSavedAdvancedFilter(source.savedAdvancedFilter),
    sort: parseSort(source.sort),
  }
}

function serializeFilters(filters: DocumentFilters): Record<string, unknown> {
  return {
    amountOperator: filters.amountOperator,
    amountValue: filters.amountValue,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    numberFrom: filters.numberFrom,
    numberTo: filters.numberTo,
    select: { ...filters.select },
    text: { ...filters.text },
  }
}

function serializeSavedAdvancedFilter(model: AdvancedFilterModel | null): unknown {
  if (model === null) return null
  return {
    connector: model.connector,
    groups: model.groups.map((group) => ({
      conditions: group.conditions.map((condition) => ({ ...condition })),
      connector: group.connector,
      id: group.id,
    })),
  }
}

export function serializeTableViewPreferences(
  preferences: TableViewPreferences,
): Record<string, unknown> {
  return {
    columnOrder: [...preferences.columnOrder],
    columnVisibility: { ...preferences.columnVisibility },
    filters: serializeFilters(preferences.filters),
    pageSize: preferences.pageSize,
    savedAdvancedFilter: serializeSavedAdvancedFilter(preferences.savedAdvancedFilter),
    sort: preferences.sort === null ? null : { ...preferences.sort },
  }
}
