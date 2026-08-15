/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatAmount } from '../../shared/decimalAmount.service'
import {
  readTableColumnPreferences,
  reorderTableColumns,
  writeTableColumnPreferences,
  type TableColumnPreferences,
  type TableColumnStorage,
} from '../../shared/tableColumnPreferences.service'
import type { FleetVehicleDetail } from './fleet.types'

export const FLEET_VEHICLE_COLUMN_KEYS = [
  'brand',
  'model',
  'modelYear',
  'axleCount',
  'color',
  'costPerKilometer',
  'monthlyFixedCost',
] as const
export type FleetVehicleColumnKey = (typeof FLEET_VEHICLE_COLUMN_KEYS)[number]

export type FleetVehicleColumnPreferences = TableColumnPreferences<FleetVehicleColumnKey>

const STORAGE_KEY = 'fleet.vehicleColumns'
const DEFAULT_HIDDEN_COLUMNS: readonly FleetVehicleColumnKey[] = [
  'modelYear',
  'axleCount',
  'color',
  'costPerKilometer',
  'monthlyFixedCost',
]

export function readFleetVehicleColumnPreferences(
  storage: TableColumnStorage | null,
): FleetVehicleColumnPreferences {
  const hasStoredValue = storage !== null && storage.getItem(STORAGE_KEY) !== null
  const preferences = readTableColumnPreferences({
    columns: FLEET_VEHICLE_COLUMN_KEYS,
    storage,
    storageKey: STORAGE_KEY,
  })
  if (hasStoredValue) return preferences
  return {
    ...preferences,
    visibility: {
      ...preferences.visibility,
      ...Object.fromEntries(DEFAULT_HIDDEN_COLUMNS.map((column) => [column, false])),
    },
  }
}

export function writeFleetVehicleColumnPreferences(
  input: Readonly<{
    preferences: FleetVehicleColumnPreferences
    storage: TableColumnStorage | null
  }>,
): void {
  writeTableColumnPreferences({
    preferences: input.preferences,
    storage: input.storage,
    storageKey: STORAGE_KEY,
  })
}

/** Célula da coluna: custo zerado é "não informado", não `R$ 0,00`, que afirmaria custo nenhum. */
export function readFleetVehicleColumnValue(
  input: Readonly<{
    colorLabel: string
    column: FleetVehicleColumnKey
    notInformedLabel: string
    vehicle: FleetVehicleDetail
  }>,
): string {
  const { colorLabel, column, notInformedLabel, vehicle } = input
  if (column === 'brand') return vehicle.brand
  if (column === 'model') return vehicle.model
  if (column === 'modelYear') return String(vehicle.modelYear)
  if (column === 'axleCount') return String(vehicle.axleCount)
  // A cor é slug fechado no banco: traduzir é papel de quem tem o `t`, não deste serviço puro.
  if (column === 'color') return colorLabel
  if (column === 'costPerKilometer') {
    if (vehicle.costPerKilometer === null) return notInformedLabel
    return formatAmount(vehicle.costPerKilometer)
  }
  if (vehicle.monthlyFixedCost === null) return notInformedLabel

  return formatAmount(vehicle.monthlyFixedCost)
}

export function reorderFleetVehicleColumns(
  order: readonly FleetVehicleColumnKey[],
  column: FleetVehicleColumnKey,
  direction: 'down' | 'up',
): readonly FleetVehicleColumnKey[] {
  return reorderTableColumns(order, column, direction)
}
