/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  AMOUNT_OPERATOR_SYMBOL,
  EMPTY_FILTERS,
  type DocumentFilters,
  type FilterKey,
  type SelectFilterField,
  type TextFilterField,
} from '../hooks/useNfeDocumentTable.hook'

/** O texto visível não mora aqui: o descritor devolve chave de tradução e quem renderiza traduz. */
export type NfeDocumentFilterPill = Readonly<{
  key: FilterKey
  labelKey: string
  value: string
  valueKey?: string
}>

type DescribePillsInput = Readonly<{
  filters: DocumentFilters
  formatDay: (value: string) => string
}>

const OPEN_RANGE_MARK = '…'
const TEXT_PILL_FIELDS: readonly TextFilterField[] = [
  'emitterName',
  'emitterAddress',
  'recipientName',
  'recipientAddress',
]
const SELECT_PILL_FIELDS: readonly SelectFilterField[] = [
  'cteIssued',
  'emitterCity',
  'emitterState',
  'recipientCity',
  'recipientState',
  'status',
]

function fieldLabelKey(key: FilterKey | 'issuedAt' | 'number' | 'totalAmount'): string {
  return `documents.fields.${key}`
}

function cteIssuedValueKey(value: string): string {
  if (value.length === 0) return 'filters.all'
  return value === 'issued' ? 'filters.cteIssuedIssued' : 'filters.cteIssuedPending'
}

function describeSelect(
  field: SelectFilterField,
  filters: DocumentFilters,
): NfeDocumentFilterPill | null {
  const value = filters.select[field]
  if (field === 'cteIssued') {
    if (value === EMPTY_FILTERS.select.cteIssued) return null
    return {
      key: field,
      labelKey: fieldLabelKey(field),
      value: '',
      valueKey: cteIssuedValueKey(value),
    }
  }
  if (value.length === 0) return null
  if (field === 'status') {
    return {
      key: field,
      labelKey: fieldLabelKey(field),
      value: '',
      valueKey: `documentStatus.${value}`,
    }
  }
  return { key: field, labelKey: fieldLabelKey(field), value }
}

function describeNumberRange(filters: DocumentFilters): NfeDocumentFilterPill | null {
  const { numberFrom, numberTo } = filters
  if (numberFrom.trim().length === 0 && numberTo.trim().length === 0) return null
  const from = numberFrom.length === 0 ? OPEN_RANGE_MARK : numberFrom
  const to = numberTo.length === 0 ? OPEN_RANGE_MARK : numberTo
  return { key: 'numberRange', labelKey: fieldLabelKey('number'), value: `${from}–${to}` }
}

function describeAmount(filters: DocumentFilters): NfeDocumentFilterPill | null {
  if (filters.amountValue.trim().length === 0) return null
  return {
    key: 'amount',
    labelKey: fieldLabelKey('totalAmount'),
    value: `${AMOUNT_OPERATOR_SYMBOL[filters.amountOperator]} ${filters.amountValue}`,
  }
}

function describeDateRange(input: DescribePillsInput): NfeDocumentFilterPill | null {
  const { dateFrom, dateTo } = input.filters
  if (dateFrom.length === 0 && dateTo.length === 0) return null
  return {
    key: 'dateRange',
    labelKey: fieldLabelKey('issuedAt'),
    value: `${input.formatDay(dateFrom)} – ${input.formatDay(dateTo)}`,
  }
}

export function describeNfeDocumentFilterPills(
  input: DescribePillsInput,
): readonly NfeDocumentFilterPill[] {
  const pills: NfeDocumentFilterPill[] = []
  for (const field of TEXT_PILL_FIELDS) {
    const value = input.filters.text[field].trim()
    if (value.length > 0) pills.push({ key: field, labelKey: fieldLabelKey(field), value })
  }
  for (const field of SELECT_PILL_FIELDS) {
    const pill = describeSelect(field, input.filters)
    if (pill !== null) pills.push(pill)
  }
  for (const pill of [
    describeNumberRange(input.filters),
    describeAmount(input.filters),
    describeDateRange(input),
  ]) {
    if (pill !== null) pills.push(pill)
  }
  return pills
}
