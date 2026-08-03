/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  describeRangeValue,
  selectionDiffersFromDefault,
} from '@/modules/shared/filterPill.service'

import { EMPTY_CTE_ITEM_FILTERS, type CteItemTableFilters } from './cteBatchItemTable.service'

/** A ordem da lista é a ordem em que as pílulas aparecem na tela. */
export const CTE_ITEM_PILL_FIELDS = [
  'cteNumberQuery',
  'invoiceNumberQuery',
  'statuses',
  'billingStatuses',
  'issuedRange',
] as const

export type CteItemPillField = (typeof CTE_ITEM_PILL_FIELDS)[number]

export type CteItemFilterPill = Readonly<{
  field: CteItemPillField
  labelKey: string
  value: string
  valueKeys?: readonly string[]
}>

type DescribePillsInput = Readonly<{
  filters: CteItemTableFilters
  formatDay: (value: string) => string
}>

type ClearPillFieldInput = Readonly<{
  field: CteItemPillField
  filters: CteItemTableFilters
}>

const FIELD_LABEL_KEY: Readonly<Record<CteItemPillField, string>> = {
  billingStatuses: 'cteItems.filters.billingStatus',
  cteNumberQuery: 'cteItems.filters.cteNumberQuery',
  invoiceNumberQuery: 'cteItems.filters.invoiceNumberQuery',
  issuedRange: 'cteItems.filters.issuedRange',
  statuses: 'cteItems.filters.status',
}

function describeSelection(
  field: 'billingStatuses' | 'statuses',
  filters: CteItemTableFilters,
): CteItemFilterPill | null {
  const values = filters[field]
  const isApplied = selectionDiffersFromDefault({
    defaults: EMPTY_CTE_ITEM_FILTERS[field],
    values,
  })
  if (!isApplied) return null
  const prefix = field === 'statuses' ? 'itemStatus' : 'itemBillingStatus'
  return {
    field,
    labelKey: FIELD_LABEL_KEY[field],
    value: '',
    valueKeys: values.map((value) => `${prefix}.${value}`),
  }
}

function describeField(
  field: CteItemPillField,
  input: DescribePillsInput,
): CteItemFilterPill | null {
  const { filters, formatDay } = input
  if (field === 'statuses' || field === 'billingStatuses') return describeSelection(field, filters)
  if (field === 'issuedRange') {
    const value = describeRangeValue({
      format: formatDay,
      from: filters.issuedFrom,
      to: filters.issuedTo,
    })
    return value.length === 0 ? null : { field, labelKey: FIELD_LABEL_KEY[field], value }
  }
  const value = filters[field].trim()
  return value.length === 0 ? null : { field, labelKey: FIELD_LABEL_KEY[field], value }
}

export function describeCteItemFilterPills(
  input: DescribePillsInput,
): readonly CteItemFilterPill[] {
  const pills: CteItemFilterPill[] = []
  for (const field of CTE_ITEM_PILL_FIELDS) {
    const pill = describeField(field, input)
    if (pill !== null) pills.push(pill)
  }
  return pills
}

/** Limpar aqui devolve o default do filtro, não uma seleção vazia — vazio esconderia a tabela inteira. */
export function clearCteItemFilterField(input: ClearPillFieldInput): CteItemTableFilters {
  if (input.field === 'issuedRange') return { ...input.filters, issuedFrom: '', issuedTo: '' }
  if (input.field === 'statuses') {
    return { ...input.filters, statuses: EMPTY_CTE_ITEM_FILTERS.statuses }
  }
  if (input.field === 'billingStatuses') {
    return { ...input.filters, billingStatuses: EMPTY_CTE_ITEM_FILTERS.billingStatuses }
  }
  return { ...input.filters, [input.field]: '' }
}
