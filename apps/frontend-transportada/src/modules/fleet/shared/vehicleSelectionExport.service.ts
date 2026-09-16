/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CSV_BYTE_ORDER_MARK,
  CSV_FIELD_SEPARATOR,
  CSV_LINE_SEPARATOR,
  escapeCsvField,
} from '@/modules/shared/csv.service'

import type { FleetVehicleDetail } from './fleet.types'
import { resolveFuelArrangementLabelKey } from './fuelArrangement.service'

/** A ordem da lista é a ordem das colunas do arquivo. */
export const VEHICLE_EXPORT_COLUMNS = [
  'plate',
  'role',
  'ownership',
  'brand',
  'model',
  'modelYear',
  'axleCount',
  'color',
  'fuelType',
  'secondaryFuelType',
  'fuelArrangement',
  'capacityKilograms',
  'tareWeightKilograms',
  'costPerKilometer',
  'monthlyFixedCost',
  'status',
] as const
export type VehicleExportColumn = (typeof VEHICLE_EXPORT_COLUMNS)[number]

export const VEHICLE_EXPORT_FILE_NAME = 'veiculos.csv'
export const VEHICLE_EXPORT_MEDIA_TYPE = 'text/csv;charset=utf-8'

const PLATE_SEPARATOR = '\n'

type ExportLabels = Readonly<{
  header: Readonly<Record<VehicleExportColumn, string>>
  translateValue: (input: Readonly<{ column: VehicleExportColumn; value: string }>) => string
}>

/** Decimal vai com vírgula: a planilha em pt-BR lê `1234.56` como texto, não como número. */
function toSpreadsheetDecimal(value: null | string): string {
  return value === null ? '' : value.replace('.', ',')
}

function readColumn(
  input: Readonly<{
    column: VehicleExportColumn
    labels: ExportLabels
    vehicle: FleetVehicleDetail
  }>,
): string {
  const { column, labels, vehicle } = input
  if (column === 'modelYear') return String(vehicle.modelYear)
  if (column === 'axleCount') return String(vehicle.axleCount)
  if (column === 'capacityKilograms') return toSpreadsheetDecimal(vehicle.capacityKilograms)
  if (column === 'tareWeightKilograms') return toSpreadsheetDecimal(vehicle.tareWeightKilograms)
  if (column === 'costPerKilometer') return toSpreadsheetDecimal(vehicle.costPerKilometer)
  if (column === 'monthlyFixedCost') return toSpreadsheetDecimal(vehicle.monthlyFixedCost)
  // O arranjo não é campo do veículo: ele é lido do par, e a chave inteira vai para a tradução
  if (column === 'fuelArrangement') {
    return labels.translateValue({ column, value: resolveFuelArrangementLabelKey(vehicle) })
  }
  if (column === 'plate') return vehicle.plate
  if (column === 'brand') return vehicle.brand
  if (column === 'model') return vehicle.model

  return labels.translateValue({ column, value: vehicle[column] })
}

export function buildVehicleSelectionCsv(
  input: Readonly<{ labels: ExportLabels; vehicles: readonly FleetVehicleDetail[] }>,
): string {
  const header = VEHICLE_EXPORT_COLUMNS.map((column) => escapeCsvField(input.labels.header[column]))
  const rows = input.vehicles.map((vehicle) =>
    VEHICLE_EXPORT_COLUMNS.map((column) =>
      escapeCsvField(readColumn({ column, labels: input.labels, vehicle })),
    ).join(CSV_FIELD_SEPARATOR),
  )

  return `${CSV_BYTE_ORDER_MARK}${[header.join(CSV_FIELD_SEPARATOR), ...rows].join(CSV_LINE_SEPARATOR)}`
}

/** Uma placa por linha: é o formato que cola direto no campo de busca do rastreador e do WhatsApp. */
export function buildVehiclePlateList(vehicles: readonly FleetVehicleDetail[]): string {
  return vehicles.map((vehicle) => vehicle.plate).join(PLATE_SEPARATOR)
}
