/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  AmountOperator,
  ConditionField,
  ConditionOperator,
  DocumentFilters,
  FieldType,
  MultiFilterField,
  SelectFilterField,
  TextFilterField,
} from './nfeFilter.types'

export const TEXT_FILTER_FIELDS: readonly TextFilterField[] = [
  'emitterAddress',
  'recipientName',
  'recipientAddress',
]

export const MULTI_FILTER_FIELDS: readonly MultiFilterField[] = ['emitterName', 'emitterTaxId']

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

/** Antigo padrão do filtro; o `unlinkedOnly` assumiu o papel de abrir só as notas ainda sem documento fiscal. */
export const CTE_ISSUED_PENDING = 'pending'

export const CTE_ISSUED_DONE = 'issued'

export const CTE_ISSUED_FILTER_VALUES: readonly string[] = [CTE_ISSUED_PENDING, CTE_ISSUED_DONE]

export const EMPTY_TEXT: Record<TextFilterField, string> = {
  emitterAddress: '',
  recipientAddress: '',
  recipientName: '',
}

export const EMPTY_MULTI: Record<MultiFilterField, readonly string[]> = {
  emitterName: [],
  emitterTaxId: [],
}

export const EMPTY_SELECT: Record<SelectFilterField, string> = {
  cteIssued: '',
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
  multi: EMPTY_MULTI,
  numberFrom: '',
  numberTo: '',
  select: EMPTY_SELECT,
  text: EMPTY_TEXT,
  unlinkedOnly: true,
}
