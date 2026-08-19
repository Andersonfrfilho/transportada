/* Copyright (c) 2026 Ada Technology. MIT License. */
import { EMPTY_VEHICLE_TABLE_FILTERS, type VehicleTableFilters } from './vehicleTable.service'

/** A ordem da lista é a ordem em que as pílulas aparecem na tela. */
export const VEHICLE_PILL_FIELDS = [
  'plateQuery',
  'roles',
  'statuses',
  'ownerships',
  'brands',
  'colors',
  'fuelTypes',
  'modelYears',
  'axleCounts',
] as const

export type VehiclePillField = (typeof VEHICLE_PILL_FIELDS)[number]

export type VehicleFilterPill = Readonly<{
  field: VehiclePillField
  labelKey: string
  value: string
  valueKeys?: readonly string[]
}>

const FIELD_LABEL_KEY: Readonly<Record<VehiclePillField, string>> = {
  axleCounts: 'vehicleFilters.axleCount',
  brands: 'vehicleFilters.brand',
  colors: 'vehicleFilters.color',
  fuelTypes: 'vehicleFilters.fuelType',
  modelYears: 'vehicleFilters.modelYear',
  ownerships: 'vehicleFilters.ownership',
  plateQuery: 'filterPlate',
  roles: 'vehicleFilters.role',
  statuses: 'vehicleFilters.status',
}

/** Rótulo por slug fechado; marca, ano e eixos são dado do cadastro e vão como texto puro. */
const VALUE_KEY_PREFIX: Readonly<Partial<Record<VehiclePillField, string>>> = {
  colors: 'colorOption',
  fuelTypes: 'fuelOption',
  ownerships: 'ownershipOption',
  roles: 'roleOption',
  statuses: 'status',
}

const SELECTION_SEPARATOR = ', '

function describeSelection(
  field: Exclude<VehiclePillField, 'plateQuery'>,
  filters: VehicleTableFilters,
): VehicleFilterPill | null {
  const values: readonly (number | string)[] = filters[field]
  if (values.length === 0) return null

  const prefix = VALUE_KEY_PREFIX[field]
  if (prefix === undefined) {
    return { field, labelKey: FIELD_LABEL_KEY[field], value: values.join(SELECTION_SEPARATOR) }
  }

  return {
    field,
    labelKey: FIELD_LABEL_KEY[field],
    value: '',
    valueKeys: values.map((value) => `${prefix}.${value}`),
  }
}

export function describeVehicleFilterPills(
  filters: VehicleTableFilters,
): readonly VehicleFilterPill[] {
  const pills: VehicleFilterPill[] = []
  for (const field of VEHICLE_PILL_FIELDS) {
    if (field === 'plateQuery') {
      const value = filters.plateQuery.trim()
      if (value !== '') pills.push({ field, labelKey: FIELD_LABEL_KEY[field], value })
      continue
    }
    const pill = describeSelection(field, filters)
    if (pill !== null) pills.push(pill)
  }

  return pills
}

export function clearVehicleFilterField(
  input: Readonly<{ field: VehiclePillField; filters: VehicleTableFilters }>,
): VehicleTableFilters {
  return { ...input.filters, [input.field]: EMPTY_VEHICLE_TABLE_FILTERS[input.field] }
}
