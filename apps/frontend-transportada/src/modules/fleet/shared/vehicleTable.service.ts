/* Copyright (c) 2026 Ada Technology. MIT License. */
import { compareScaledAmounts } from '../../shared/decimalAmount.service'
import { FUEL_PRODUCTS, type FuelProduct } from '../../shared/fuel.constant'
import type {
  FleetVehicleDetail,
  FleetVehicleOwnership,
  FleetVehicleRole,
  FleetVehicleStatus,
} from './fleet.types'
import { resolveFuelArrangementLabelKey } from './fuelArrangement.service'

export const VEHICLE_SORT_COLUMNS = [
  'plate',
  'role',
  'ownership',
  'brand',
  'model',
  'modelYear',
  'axleCount',
  'color',
  'fuelArrangement',
  'costPerKilometer',
  'monthlyFixedCost',
  'capacityKilograms',
  'status',
] as const
export type VehicleSortColumn = (typeof VEHICLE_SORT_COLUMNS)[number]

export type VehicleSortDirection = 'asc' | 'desc'

export type VehicleSortState = null | Readonly<{
  column: VehicleSortColumn
  direction: VehicleSortDirection
}>

export type VehicleTableFilters = Readonly<{
  axleCounts: readonly number[]
  brands: readonly string[]
  colors: readonly string[]
  fuelTypes: readonly FuelProduct[]
  modelYears: readonly number[]
  ownerships: readonly FleetVehicleOwnership[]
  plateQuery: string
  roles: readonly FleetVehicleRole[]
  statuses: readonly FleetVehicleStatus[]
}>

export const EMPTY_VEHICLE_TABLE_FILTERS: VehicleTableFilters = {
  axleCounts: [],
  brands: [],
  colors: [],
  fuelTypes: [],
  modelYears: [],
  ownerships: [],
  plateQuery: '',
  roles: [],
  statuses: [],
}

export type VehicleFilterOptions = Readonly<{
  axleCounts: readonly number[]
  brands: readonly string[]
  colors: readonly string[]
  fuelTypes: readonly FuelProduct[]
  modelYears: readonly number[]
}>

const NON_ALPHANUMERIC_PATTERN = /[^0-9A-Z]/g
const textCollator = new Intl.Collator('pt-BR', { sensitivity: 'base' })

/** A placa é comparada sem máscara: quem digita `ABC-1D23` procura o mesmo veículo de `ABC1D23`. */
function normalizePlateQuery(value: string): string {
  return value.toUpperCase().replace(NON_ALPHANUMERIC_PATTERN, '')
}

/** Terceiro clique no cabeçalho volta à ordem natural — sem ele não há como desfazer a ordenação. */
export function nextVehicleSortState(
  current: VehicleSortState,
  column: VehicleSortColumn,
): VehicleSortState {
  if (current === null || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}

export function toggleFilterValue<TValue>(
  values: readonly TValue[],
  value: TValue,
): readonly TValue[] {
  return values.includes(value) ? values.filter((current) => current !== value) : [...values, value]
}

function matchesSelection<TValue>(selected: readonly TValue[], value: TValue): boolean {
  return selected.length === 0 || selected.includes(value)
}

export function filterVehicles(
  input: Readonly<{
    filters: VehicleTableFilters
    vehicles: readonly FleetVehicleDetail[]
  }>,
): readonly FleetVehicleDetail[] {
  const plateQuery = normalizePlateQuery(input.filters.plateQuery)

  return input.vehicles.filter((vehicle) => {
    if (plateQuery !== '' && !vehicle.plate.includes(plateQuery)) return false
    if (!matchesSelection(input.filters.brands, vehicle.brand)) return false
    if (!matchesSelection(input.filters.colors, vehicle.color)) return false
    if (!matchesSelection(input.filters.fuelTypes, vehicle.fuelType)) return false
    if (!matchesSelection(input.filters.modelYears, vehicle.modelYear)) return false
    if (!matchesSelection(input.filters.axleCounts, vehicle.axleCount)) return false
    if (!matchesSelection(input.filters.ownerships, vehicle.ownership)) return false
    if (!matchesSelection(input.filters.roles, vehicle.role)) return false
    return matchesSelection(input.filters.statuses, vehicle.status)
  })
}

/**
 * Custo ausente vai para o fim nas duas direções: `null` é falta de dado, não o menor valor — por
 * isso a comparação acontece antes da direção, fora do fator que inverte a ordem.
 */
function compareAbsentAmount(
  column: VehicleSortColumn,
  left: FleetVehicleDetail,
  right: FleetVehicleDetail,
): null | number {
  if (column !== 'costPerKilometer' && column !== 'monthlyFixedCost') return null
  if (left[column] === null && right[column] === null) return 0
  if (left[column] === null) return 1
  if (right[column] === null) return -1
  return null
}

function compareByColumn(
  column: VehicleSortColumn,
  left: FleetVehicleDetail,
  right: FleetVehicleDetail,
): number {
  if (column === 'modelYear') return left.modelYear - right.modelYear
  if (column === 'axleCount') return left.axleCount - right.axleCount
  // O arranjo é derivado do par e traduzido na tela: ordenar pela chave mantém a ordem estável
  if (column === 'fuelArrangement') {
    return textCollator.compare(
      resolveFuelArrangementLabelKey(left),
      resolveFuelArrangementLabelKey(right),
    )
  }
  if (column === 'capacityKilograms') {
    return compareScaledAmounts(left.capacityKilograms, right.capacityKilograms)
  }
  if (column === 'costPerKilometer' || column === 'monthlyFixedCost') {
    return compareScaledAmounts(left[column] ?? '0', right[column] ?? '0')
  }
  // A cor é slug fechado: ordenar pelo rótulo traduzido exigiria o `t` dentro de um serviço puro
  return textCollator.compare(left[column], right[column])
}

export function sortVehicles(
  input: Readonly<{
    sort: VehicleSortState
    vehicles: readonly FleetVehicleDetail[]
  }>,
): readonly FleetVehicleDetail[] {
  const sort = input.sort
  if (sort === null) return input.vehicles

  const factor = sort.direction === 'asc' ? 1 : -1
  return [...input.vehicles].sort((left, right) => {
    const absent = compareAbsentAmount(sort.column, left, right)
    if (absent !== null) return absent
    return factor * compareByColumn(sort.column, left, right)
  })
}

function distinctSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value !== ''))].sort((left, right) =>
    textCollator.compare(left, right),
  )
}

/** As opções nascem da frota carregada: marca que ninguém cadastrou não vira filtro fantasma. */
export function collectVehicleFilterOptions(
  vehicles: readonly FleetVehicleDetail[],
): VehicleFilterOptions {
  const fuelTypes = new Set(vehicles.map((vehicle) => vehicle.fuelType))

  return {
    axleCounts: [...new Set(vehicles.map((vehicle) => vehicle.axleCount))].sort(
      (left, right) => left - right,
    ),
    brands: distinctSorted(vehicles.map((vehicle) => vehicle.brand)),
    colors: distinctSorted(vehicles.map((vehicle) => vehicle.color)),
    fuelTypes: FUEL_PRODUCTS.filter((product) => fuelTypes.has(product)),
    modelYears: [...new Set(vehicles.map((vehicle) => vehicle.modelYear))].sort(
      (left, right) => right - left,
    ),
  }
}

export function countActiveVehicleFilters(filters: VehicleTableFilters): number {
  const selections = [
    filters.axleCounts,
    filters.brands,
    filters.colors,
    filters.fuelTypes,
    filters.modelYears,
    filters.ownerships,
    filters.roles,
    filters.statuses,
  ]
  const selectionCount = selections.filter((values) => values.length > 0).length

  return filters.plateQuery.trim() === '' ? selectionCount : selectionCount + 1
}

export type VehicleSelectionState = 'all' | 'none' | 'partial'

export function resolveVehicleSelectionState(
  input: Readonly<{ selectedIds: readonly string[]; visibleIds: readonly string[] }>,
): VehicleSelectionState {
  if (input.visibleIds.length === 0) return 'none'
  const selected = new Set(input.selectedIds)
  const selectedVisible = input.visibleIds.filter((id) => selected.has(id))
  if (selectedVisible.length === 0) return 'none'
  return selectedVisible.length === input.visibleIds.length ? 'all' : 'partial'
}

/**
 * A seleção sobrevive ao filtro: esconder a linha não desmarca o veículo, mas "selecionar todos"
 * só alcança o que está à vista — a barra de ações não pode agir sobre o que não se vê.
 */
export function toggleVisibleSelection(
  input: Readonly<{ selectedIds: readonly string[]; visibleIds: readonly string[] }>,
): readonly string[] {
  const state = resolveVehicleSelectionState(input)
  if (state === 'all') {
    const visible = new Set(input.visibleIds)
    return input.selectedIds.filter((id) => !visible.has(id))
  }
  return [...new Set([...input.selectedIds, ...input.visibleIds])]
}
