/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FreightVehicleClass } from '@/modules/shared/freightClass.constant'

import {
  EMPTY_FREIGHT_REGION_TABLE_FILTERS,
  type FreightRegionTableFilters,
} from './freightRegionTable.service'

/** A ordem da lista é a ordem em que as pílulas aparecem na tela. */
export const FREIGHT_REGION_PILL_FIELDS = [
  'query',
  'cityQuery',
  'zones',
  'statuses',
  'classes',
] as const

export type FreightRegionPillField = (typeof FREIGHT_REGION_PILL_FIELDS)[number]

export type FreightRegionFilterPill = Readonly<{
  field: FreightRegionPillField
  labelKey: string
  value: string
  valueKeys?: readonly string[]
}>

const FIELD_LABEL_KEY: Readonly<Record<FreightRegionPillField, string>> = {
  cityQuery: 'regionFilters.city',
  classes: 'regionFilters.class',
  query: 'regionFilters.query',
  statuses: 'regionFilters.status',
  zones: 'regionFilters.zone',
}

const SELECTION_SEPARATOR = ', '

function selectionPill(input: {
  readonly field: FreightRegionPillField
  readonly keyPrefix: string
  readonly values: readonly string[]
}): FreightRegionFilterPill | null {
  if (input.values.length === 0) return null
  const valueKeys = input.values.map((value) => `${input.keyPrefix}.${value}`)
  return {
    field: input.field,
    labelKey: FIELD_LABEL_KEY[input.field],
    value: input.values.join(SELECTION_SEPARATOR),
    valueKeys,
  }
}

function queryPill(field: FreightRegionPillField, value: string): FreightRegionFilterPill | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  return { field, labelKey: FIELD_LABEL_KEY[field], value: trimmed }
}

export function describeFreightRegionFilterPills(
  filters: FreightRegionTableFilters,
): readonly FreightRegionFilterPill[] {
  const zones =
    filters.zones.length === 0
      ? null
      : {
          field: 'zones' as const,
          labelKey: FIELD_LABEL_KEY.zones,
          value: filters.zones.map(String).join(SELECTION_SEPARATOR),
        }

  return [
    queryPill('query', filters.query),
    queryPill('cityQuery', filters.cityQuery),
    zones,
    selectionPill({ field: 'statuses', keyPrefix: 'regionStatus', values: filters.statuses }),
    selectionPill({ field: 'classes', keyPrefix: 'freightClass', values: filters.classes }),
  ].filter((pill): pill is FreightRegionFilterPill => pill !== null)
}

export function clearFreightRegionFilterField(
  filters: FreightRegionTableFilters,
  field: FreightRegionPillField,
): FreightRegionTableFilters {
  if (field === 'classes') return { ...filters, classes: [] as readonly FreightVehicleClass[] }
  if (field === 'statuses') return { ...filters, statuses: [] }
  if (field === 'zones') return { ...filters, zones: [] }
  return { ...filters, [field]: EMPTY_FREIGHT_REGION_TABLE_FILTERS[field] }
}
