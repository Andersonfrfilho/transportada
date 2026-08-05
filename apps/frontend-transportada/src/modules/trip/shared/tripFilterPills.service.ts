/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describeRangeValue } from '@/modules/shared/filterPill.service'

import type { TripFilters } from './trip.types'

export const TRIP_PILL_FIELDS = ['statusEq', 'vehicleIdEq', 'driverIdEq', 'createdRange'] as const
export type TripPillField = (typeof TRIP_PILL_FIELDS)[number]

export type TripFilterPill = Readonly<{
  field: TripPillField
  labelKey: string
  value: string
  valueKey?: string
}>

function labelKey(field: TripPillField): string {
  return `filters.${field}`
}

export function describeTripFilterPills(
  input: Readonly<{ filters: TripFilters; formatDay: (value: string) => string }>,
): readonly TripFilterPill[] {
  const pills: TripFilterPill[] = []
  const { filters, formatDay } = input

  if (filters.statusEq !== undefined) {
    pills.push({
      field: 'statusEq',
      labelKey: labelKey('statusEq'),
      value: filters.statusEq,
      valueKey: `status.${filters.statusEq}`,
    })
  }
  if (filters.vehicleIdEq !== undefined && filters.vehicleIdEq !== '') {
    pills.push({
      field: 'vehicleIdEq',
      labelKey: labelKey('vehicleIdEq'),
      value: filters.vehicleIdEq,
    })
  }
  if (filters.driverIdEq !== undefined && filters.driverIdEq !== '') {
    pills.push({ field: 'driverIdEq', labelKey: labelKey('driverIdEq'), value: filters.driverIdEq })
  }
  if (filters.createdFrom !== undefined || filters.createdUntil !== undefined) {
    pills.push({
      field: 'createdRange',
      labelKey: labelKey('createdRange'),
      value: describeRangeValue({
        format: formatDay,
        from: filters.createdFrom ?? '',
        to: filters.createdUntil ?? '',
      }),
    })
  }

  return pills
}

function omitFilterKeys(filters: TripFilters, keys: readonly string[]): TripFilters {
  return Object.fromEntries(Object.entries(filters).filter(([key]) => !keys.includes(key)))
}

export function clearTripFilterField(
  input: Readonly<{ field: TripPillField; filters: TripFilters }>,
): TripFilters {
  if (input.field === 'createdRange') {
    return omitFilterKeys(input.filters, ['createdFrom', 'createdUntil'])
  }
  return omitFilterKeys(input.filters, [input.field])
}
