/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  describeRangeValue,
  selectionDiffersFromDefault,
  SELECTION_SEPARATOR,
} from '@/modules/shared/filterPill.service'

import {
  EMPTY_MDFE_MANIFEST_FILTERS,
  type MdfeManifestTableFilters,
} from './mdfeManifestTable.service'

/** A ordem da lista é a ordem em que as pílulas aparecem na tela. */
export const MDFE_MANIFEST_PILL_FIELDS = [
  'fiscalNumberContains',
  'statuses',
  'destinationStates',
  'cteCountRange',
  'createdRange',
] as const

export type MdfeManifestPillField = (typeof MDFE_MANIFEST_PILL_FIELDS)[number]

export type MdfeManifestFilterPill = Readonly<{
  field: MdfeManifestPillField
  labelKey: string
  value: string
  valueKeys?: readonly string[]
}>

type DescribePillsInput = Readonly<{
  filters: MdfeManifestTableFilters
  formatDay: (value: string) => string
}>

type ClearPillFieldInput = Readonly<{
  field: MdfeManifestPillField
  filters: MdfeManifestTableFilters
}>

const FIELD_LABEL_KEY: Readonly<Record<MdfeManifestPillField, string>> = {
  createdRange: 'filters.createdRange',
  cteCountRange: 'filters.cteCountFrom',
  destinationStates: 'columns.destinationState',
  fiscalNumberContains: 'filters.fiscalNumber',
  statuses: 'filters.status',
}

function describeField(
  field: MdfeManifestPillField,
  input: DescribePillsInput,
): MdfeManifestFilterPill | null {
  const { filters, formatDay } = input
  const labelKey = FIELD_LABEL_KEY[field]
  if (field === 'fiscalNumberContains') {
    const value = filters.fiscalNumberContains.trim()
    return value.length === 0 ? null : { field, labelKey, value }
  }
  if (field === 'statuses') {
    const isApplied = selectionDiffersFromDefault({
      defaults: EMPTY_MDFE_MANIFEST_FILTERS.statuses,
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
  /** A sigla da UF já é o rótulo: traduzir estado por chave só criaria dicionário redundante. */
  if (field === 'destinationStates') {
    const states = filters.destinationStates
    if (states.length === 0) return null
    return { field, labelKey, value: states.join(SELECTION_SEPARATOR) }
  }
  const range =
    field === 'cteCountRange'
      ? describeRangeValue({ from: filters.cteCountFrom, to: filters.cteCountTo })
      : describeRangeValue({
          format: formatDay,
          from: filters.createdFrom,
          to: filters.createdTo,
        })
  return range.length === 0 ? null : { field, labelKey, value: range }
}

export function describeMdfeManifestFilterPills(
  input: DescribePillsInput,
): readonly MdfeManifestFilterPill[] {
  const pills: MdfeManifestFilterPill[] = []
  for (const field of MDFE_MANIFEST_PILL_FIELDS) {
    const pill = describeField(field, input)
    if (pill !== null) pills.push(pill)
  }
  return pills
}

export function clearMdfeManifestFilterField(input: ClearPillFieldInput): MdfeManifestTableFilters {
  if (input.field === 'createdRange') return { ...input.filters, createdFrom: '', createdTo: '' }
  if (input.field === 'cteCountRange') {
    return { ...input.filters, cteCountFrom: '', cteCountTo: '' }
  }
  if (input.field === 'statuses') {
    return { ...input.filters, statuses: EMPTY_MDFE_MANIFEST_FILTERS.statuses }
  }
  if (input.field === 'destinationStates') {
    return { ...input.filters, destinationStates: EMPTY_MDFE_MANIFEST_FILTERS.destinationStates }
  }
  return { ...input.filters, fiscalNumberContains: '' }
}
