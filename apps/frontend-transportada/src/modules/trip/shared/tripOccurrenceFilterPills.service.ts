/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  describeRangeValue,
  selectionDiffersFromDefault,
} from '@/modules/shared/filterPill.service'

import {
  EMPTY_TRIP_OCCURRENCE_FILTERS,
  type TripOccurrenceFeedFilters,
} from './tripOccurrenceFeed.service'

/** A ordem da lista é a ordem em que as pílulas aparecem na tela. */
export const TRIP_OCCURRENCE_PILL_FIELDS = [
  'stages',
  'typesQuery',
  'platesQuery',
  'createdRange',
] as const

export type TripOccurrencePillField = (typeof TRIP_OCCURRENCE_PILL_FIELDS)[number]

export type TripOccurrenceFilterPill = Readonly<{
  field: TripOccurrencePillField
  labelKey: string
  value: string
  valueKeys?: readonly string[]
}>

const FIELD_LABEL_KEY: Readonly<Record<TripOccurrencePillField, string>> = {
  createdRange: 'occurrenceFeed.filters.createdRange',
  platesQuery: 'occurrenceFeed.filters.plates',
  stages: 'occurrenceFeed.filters.stage',
  typesQuery: 'occurrenceFeed.filters.types',
}

type DescribePillsInput = Readonly<{
  filters: TripOccurrenceFeedFilters
  formatDay: (value: string) => string
}>

function describeField(
  field: TripOccurrencePillField,
  input: DescribePillsInput,
): null | TripOccurrenceFilterPill {
  const { filters, formatDay } = input
  if (field === 'stages') {
    const isApplied = selectionDiffersFromDefault({
      defaults: EMPTY_TRIP_OCCURRENCE_FILTERS.stages,
      values: filters.stages,
    })
    if (!isApplied) return null
    return {
      field,
      labelKey: FIELD_LABEL_KEY[field],
      value: '',
      valueKeys: filters.stages.map((stage) => `occurrenceFeed.stage.${stage}`),
    }
  }
  if (field === 'createdRange') {
    const value = describeRangeValue({
      format: formatDay,
      from: filters.createdFrom,
      to: filters.createdUntil,
    })
    return value.length === 0 ? null : { field, labelKey: FIELD_LABEL_KEY[field], value }
  }
  const value = filters[field].trim()
  return value.length === 0 ? null : { field, labelKey: FIELD_LABEL_KEY[field], value }
}

export function describeTripOccurrenceFilterPills(
  input: DescribePillsInput,
): readonly TripOccurrenceFilterPill[] {
  const pills: TripOccurrenceFilterPill[] = []
  for (const field of TRIP_OCCURRENCE_PILL_FIELDS) {
    const pill = describeField(field, input)
    if (pill !== null) pills.push(pill)
  }
  return pills
}

/** Limpar a seleção de grupo devolve o default (todos), nunca `[]` — vazio esconderia a tabela. */
export function clearTripOccurrenceFilterField(
  input: Readonly<{ field: TripOccurrencePillField; filters: TripOccurrenceFeedFilters }>,
): TripOccurrenceFeedFilters {
  if (input.field === 'createdRange') {
    return { ...input.filters, createdFrom: '', createdUntil: '' }
  }
  if (input.field === 'stages') {
    return { ...input.filters, stages: EMPTY_TRIP_OCCURRENCE_FILTERS.stages }
  }
  return { ...input.filters, [input.field]: '' }
}
