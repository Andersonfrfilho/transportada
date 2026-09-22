/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CSV_BYTE_ORDER_MARK,
  CSV_FIELD_SEPARATOR,
  CSV_LINE_SEPARATOR,
  escapeCsvField,
} from '@/modules/shared/csv.service'

import type { TripPendingMeasurement } from './trip.types'

/** A ordem da lista é a ordem das colunas do arquivo — a mesma do painel "O que falta medir". */
export const TRIP_PENDING_MEASUREMENT_EXPORT_COLUMNS = [
  'product',
  'document',
  'stop',
  'boxCount',
  'estimateSource',
] as const
export type TripPendingMeasurementExportColumn =
  (typeof TRIP_PENDING_MEASUREMENT_EXPORT_COLUMNS)[number]

export const TRIP_PENDING_MEASUREMENTS_CSV_MEDIA_TYPE = 'text/csv;charset=utf-8'

export type TripPendingMeasurementsExportLabels = Readonly<{
  emptyValue: string
  estimateSourceLabel: (source: TripPendingMeasurement['estimateSource']) => string
  header: Readonly<Record<TripPendingMeasurementExportColumn, string>>
  unknownProduct: string
}>

function readCell(
  input: Readonly<{
    column: TripPendingMeasurementExportColumn
    labels: TripPendingMeasurementsExportLabels
    measurement: TripPendingMeasurement
  }>,
): number | string {
  const { column, labels, measurement } = input
  if (column === 'boxCount') return measurement.boxCount
  if (column === 'product')
    return measurement.label ?? measurement.productCode ?? labels.unknownProduct
  if (column === 'document') return measurement.documentNumber ?? labels.emptyValue
  if (column === 'stop') return measurement.stopLabel
  return labels.estimateSourceLabel(measurement.estimateSource)
}

/** Cabeçalho na mesma ordem das colunas — usado pelo CSV e pela planilha. */
export function buildTripPendingMeasurementsHeader(
  labels: TripPendingMeasurementsExportLabels,
): readonly string[] {
  return TRIP_PENDING_MEASUREMENT_EXPORT_COLUMNS.map((column) => labels.header[column])
}

/**
 * Uma linha por pendência, com os mesmos textos e os mesmos fallbacks da tabela do painel — nunca
 * uma segunda leitura dos campos. `boxCount` sai como número (planilha soma sem converter texto).
 */
export function buildTripPendingMeasurementsRows(
  input: Readonly<{
    labels: TripPendingMeasurementsExportLabels
    measurements: readonly TripPendingMeasurement[]
  }>,
): readonly (readonly (number | string)[])[] {
  return input.measurements.map((measurement) =>
    TRIP_PENDING_MEASUREMENT_EXPORT_COLUMNS.map((column) =>
      readCell({ column, labels: input.labels, measurement }),
    ),
  )
}

/**
 * Linhas prontas para `write-excel-file` (`sheetData`): cabeçalho + dados, sem depender da lib no
 * módulo puro — só quem chama decide como serializar (CSV aqui, `.xlsx` no clique do botão).
 */
export function buildTripPendingMeasurementsSheetData(
  input: Readonly<{
    labels: TripPendingMeasurementsExportLabels
    measurements: readonly TripPendingMeasurement[]
  }>,
): readonly (readonly (number | string)[])[] {
  return [
    buildTripPendingMeasurementsHeader(input.labels),
    ...buildTripPendingMeasurementsRows(input),
  ]
}

export function buildTripPendingMeasurementsCsv(
  input: Readonly<{
    labels: TripPendingMeasurementsExportLabels
    measurements: readonly TripPendingMeasurement[]
  }>,
): string {
  const header = buildTripPendingMeasurementsHeader(input.labels).map(escapeCsvField)
  const rows = buildTripPendingMeasurementsRows(input).map((row) =>
    row.map((value) => escapeCsvField(String(value))).join(CSV_FIELD_SEPARATOR),
  )

  return `${CSV_BYTE_ORDER_MARK}${[header.join(CSV_FIELD_SEPARATOR), ...rows].join(CSV_LINE_SEPARATOR)}`
}

/** `YYYY-MM-DD`, sem dado pessoal: a data de hoje é o que identifica o arquivo. */
export function tripPendingMeasurementsFileName(
  input: Readonly<{ extension: 'csv' | 'xlsx'; today: string }>,
): string {
  return `medidas-pendentes-viagem-${input.today}.${input.extension}`
}
