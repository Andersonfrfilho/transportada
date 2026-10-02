import { describeRangeValue } from '@/modules/shared/filterPill.service'

import type { TripFilters } from './trip.types'

export const TRIP_PILL_FIELDS = ['statusIn', 'vehicleIdIn', 'driverIdIn', 'createdRange'] as const
export type TripPillField = (typeof TRIP_PILL_FIELDS)[number]

export type TripFilterPill = Readonly<{
  field: TripPillField
  labelKey: string
  value: string
  valueKeys?: readonly string[]
}>

const FIELD_LABEL_KEY: Readonly<Record<TripPillField, string>> = {
  createdRange: 'filters.createdRange',
  driverIdIn: 'filters.driverId',
  statusIn: 'filters.status',
  vehicleIdIn: 'filters.vehicleId',
}

/**
 * Placa e nome não são chave de idioma — eles vivem no cadastro da frota. Quem chama resolve o
 * rótulo; a pílula só o repassa, e um id sem cadastro aparece como id em vez de sumir da tela.
 */
type DescribePillsInput = Readonly<{
  describeDriver: (driverId: string) => string
  describeVehicle: (vehicleId: string) => string
  filters: TripFilters
  formatDay: (value: string) => string
}>

function describeField(field: TripPillField, input: DescribePillsInput): null | TripFilterPill {
  const { filters, formatDay } = input
  if (field === 'statusIn') {
    const statuses = filters.statusIn ?? []
    if (statuses.length === 0) return null
    return {
      field,
      labelKey: FIELD_LABEL_KEY[field],
      value: '',
      valueKeys: statuses.map((status) => `status.${status}`),
    }
  }
  if (field === 'vehicleIdIn') {
    const vehicleIds = filters.vehicleIdIn ?? []
    if (vehicleIds.length === 0) return null
    return {
      field,
      labelKey: FIELD_LABEL_KEY[field],
      value: vehicleIds.map(input.describeVehicle).join(', '),
    }
  }
  if (field === 'driverIdIn') {
    const driverIds = filters.driverIdIn ?? []
    if (driverIds.length === 0) return null
    return {
      field,
      labelKey: FIELD_LABEL_KEY[field],
      value: driverIds.map(input.describeDriver).join(', '),
    }
  }
  const value = describeRangeValue({
    format: formatDay,
    from: filters.createdFrom ?? '',
    to: filters.createdUntil ?? '',
  })
  return value.length === 0 ? null : { field, labelKey: FIELD_LABEL_KEY[field], value }
}

export function describeTripFilterPills(input: DescribePillsInput): readonly TripFilterPill[] {
  const pills: TripFilterPill[] = []
  for (const field of TRIP_PILL_FIELDS) {
    const pill = describeField(field, input)
    if (pill !== null) pills.push(pill)
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
