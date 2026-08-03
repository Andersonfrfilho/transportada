/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  describeRangeValue,
  selectionDiffersFromDefault,
} from '@/modules/shared/filterPill.service'

import { EMPTY_CTE_BATCH_FILTERS, type CteBatchTableFilters } from './cteBatchTable.service'

/** A ordem da lista é a ordem em que as pílulas aparecem na tela. */
export const CTE_BATCH_PILL_FIELDS = [
  'nameContains',
  'statuses',
  'itemCountRange',
  'createdRange',
] as const

export type CteBatchPillField = (typeof CTE_BATCH_PILL_FIELDS)[number]

export type CteBatchFilterPill = Readonly<{
  field: CteBatchPillField
  labelKey: string
  value: string
  valueKeys?: readonly string[]
}>

type DescribePillsInput = Readonly<{
  filters: CteBatchTableFilters
  formatDay: (value: string) => string
}>

type ClearPillFieldInput = Readonly<{
  field: CteBatchPillField
  filters: CteBatchTableFilters
}>

const FIELD_LABEL_KEY: Readonly<Record<CteBatchPillField, string>> = {
  createdRange: 'filters.createdRange',
  itemCountRange: 'filters.itemCountFrom',
  nameContains: 'filters.name',
  statuses: 'filters.status',
}

function describeField(
  field: CteBatchPillField,
  input: DescribePillsInput,
): CteBatchFilterPill | null {
  const { filters, formatDay } = input
  const labelKey = FIELD_LABEL_KEY[field]
  if (field === 'nameContains') {
    const value = filters.nameContains.trim()
    return value.length === 0 ? null : { field, labelKey, value }
  }
  if (field === 'statuses') {
    const isApplied = selectionDiffersFromDefault({
      defaults: EMPTY_CTE_BATCH_FILTERS.statuses,
      values: filters.statuses,
    })
    if (!isApplied) return null
    return {
      field,
      labelKey,
      value: '',
      valueKeys: filters.statuses.map((status) => `status.${status}`),
    }
  }
  const range =
    field === 'itemCountRange'
      ? describeRangeValue({ from: filters.itemCountFrom, to: filters.itemCountTo })
      : describeRangeValue({
          format: formatDay,
          from: filters.createdFrom,
          to: filters.createdTo,
        })
  return range.length === 0 ? null : { field, labelKey, value: range }
}

export function describeCteBatchFilterPills(
  input: DescribePillsInput,
): readonly CteBatchFilterPill[] {
  const pills: CteBatchFilterPill[] = []
  for (const field of CTE_BATCH_PILL_FIELDS) {
    const pill = describeField(field, input)
    if (pill !== null) pills.push(pill)
  }
  return pills
}

export function clearCteBatchFilterField(input: ClearPillFieldInput): CteBatchTableFilters {
  if (input.field === 'createdRange') return { ...input.filters, createdFrom: '', createdTo: '' }
  if (input.field === 'itemCountRange') {
    return { ...input.filters, itemCountFrom: '', itemCountTo: '' }
  }
  if (input.field === 'statuses') {
    return { ...input.filters, statuses: EMPTY_CTE_BATCH_FILTERS.statuses }
  }
  return { ...input.filters, nameContains: '' }
}
