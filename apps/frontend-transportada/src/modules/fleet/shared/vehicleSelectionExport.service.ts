/* Copyright (c) 2026 Ada Technology. MIT License. */
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

/**
 * Ponto e vírgula, CRLF e BOM: é o que o Excel em pt-BR abre sem assistente de importação e sem
 * comer o acento. Vírgula como separador brigaria com a vírgula decimal do próprio número.
 */
const FIELD_SEPARATOR = ';'
const LINE_SEPARATOR = '\r\n'
const BYTE_ORDER_MARK = '﻿'
const PLATE_SEPARATOR = '\n'
const QUOTE_PATTERN = /"/g

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

function escapeField(value: string): string {
  return `"${value.replace(QUOTE_PATTERN, '""')}"`
}

export function buildVehicleSelectionCsv(
  input: Readonly<{ labels: ExportLabels; vehicles: readonly FleetVehicleDetail[] }>,
): string {
  const header = VEHICLE_EXPORT_COLUMNS.map((column) => escapeField(input.labels.header[column]))
  const rows = input.vehicles.map((vehicle) =>
    VEHICLE_EXPORT_COLUMNS.map((column) =>
      escapeField(readColumn({ column, labels: input.labels, vehicle })),
    ).join(FIELD_SEPARATOR),
  )

  return `${BYTE_ORDER_MARK}${[header.join(FIELD_SEPARATOR), ...rows].join(LINE_SEPARATOR)}`
}

/** Uma placa por linha: é o formato que cola direto no campo de busca do rastreador e do WhatsApp. */
export function buildVehiclePlateList(vehicles: readonly FleetVehicleDetail[]): string {
  return vehicles.map((vehicle) => vehicle.plate).join(PLATE_SEPARATOR)
}
