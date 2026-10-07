/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  toSpreadsheetNumber,
  type SpreadsheetCellValue,
  type SpreadsheetColumn,
} from '@/modules/shared/spreadsheet/spreadsheetLayout.service'
import {
  CSV_BYTE_ORDER_MARK,
  CSV_FIELD_SEPARATOR,
  CSV_LINE_SEPARATOR,
  escapeCsvField,
} from '@/modules/shared/csv.service'

import type { CameraMeasurementExportEntry } from './cameraMeasurementValidation.service'
import { CAMERA_PARTICIPATION_SOURCES } from './packageBoxMeasurement.constant'

type ExportDimension = 'height' | 'length' | 'width'

const EXPORT_DIMENSIONS: readonly ExportDimension[] = ['length', 'width', 'height']

const DIMENSION_LABEL: Readonly<Record<ExportDimension, string>> = {
  height: 'altura',
  length: 'comprimento',
  width: 'largura',
}

/** A ordem da lista é a ordem das colunas do arquivo (R8: colunas do spike). */
export const CAMERA_MEASUREMENT_EXPORT_COLUMNS = [
  'caixa',
  'dimensao',
  'fita_mm',
  'camera_mm',
  'erro_mm',
  'margem_mm',
  'dentro_da_margem',
  'motivos',
  'origem',
  'gravado_em',
] as const

const CAMERA_NUMERIC_COLUMN_RANGE = { first: 2, last: 5 } as const

const CAMERA_COLUMN_LAYOUT: readonly SpreadsheetColumn[] = [
  { format: '@', header: 'caixa', width: 24 },
  { header: 'dimensao', width: 12 },
  { align: 'right', format: '0', header: 'fita_mm', width: 12 },
  { align: 'right', format: '0', header: 'camera_mm', width: 12 },
  { align: 'right', format: '0', header: 'erro_mm', width: 12 },
  { align: 'right', format: '0', header: 'margem_mm', width: 12 },
  { align: 'center', header: 'dentro_da_margem', width: 18 },
  { header: 'motivos', width: 30 },
  { header: 'origem', width: 16 },
  { header: 'gravado_em', width: 24 },
]

export const CAMERA_MEASUREMENT_EXPORT_FILE_NAME = 'medidas-camera.csv'
export const CAMERA_MEASUREMENT_EXPORT_EXCEL_FILE_NAME = 'medidas-camera.xlsx'
export const CAMERA_MEASUREMENT_EXPORT_MEDIA_TYPE = 'text/csv;charset=utf-8'

/** R8: nunca a descrição do produto — só o código do produto e o GTIN da caixa identificam a linha. */
function boxLabel(entry: CameraMeasurementExportEntry): string {
  return entry.cartonGtin === null
    ? entry.productCode
    : `${entry.productCode} · ${entry.cartonGtin}`
}

function dimensionValues(
  entry: CameraMeasurementExportEntry,
  dimension: ExportDimension,
): Readonly<{ marginMm: null | number; proposedMm: null | number; recordedMm: number }> {
  if (dimension === 'length') {
    return {
      marginMm: entry.lengthMarginMm,
      proposedMm: entry.proposedLengthMm,
      recordedMm: entry.lengthMm,
    }
  }
  if (dimension === 'width') {
    return {
      marginMm: entry.widthMarginMm,
      proposedMm: entry.proposedWidthMm,
      recordedMm: entry.widthMm,
    }
  }
  return {
    marginMm: entry.heightMarginMm,
    proposedMm: entry.proposedHeightMm,
    recordedMm: entry.heightMm,
  }
}

function toRow(entry: CameraMeasurementExportEntry, dimension: ExportDimension): readonly string[] {
  const { marginMm, proposedMm, recordedMm } = dimensionValues(entry, dimension)
  const errorMm = proposedMm === null ? null : Math.abs(proposedMm - recordedMm)
  const withinMargin = errorMm === null || marginMm === null ? null : errorMm <= marginMm

  return [
    boxLabel(entry),
    DIMENSION_LABEL[dimension],
    String(recordedMm),
    proposedMm === null ? '' : String(proposedMm),
    errorMm === null ? '' : String(errorMm),
    marginMm === null ? '' : String(marginMm),
    withinMargin === null ? '' : withinMargin ? 'sim' : 'não',
    entry.warnings.join('; '),
    entry.source,
    entry.createdAt,
  ]
}

/**
 * Spec 152 R8: uma linha por dimensão de cada medida com participação da câmera (`camera`/
 * `camera_adjusted`). ⚠️ T14 (revisão final, ALTO-1): o filtro é positivo, não `!== 'typed'` — a
 * caixa replicada (spec 155 D6) nunca foi medida, não tem proposta nenhuma para comparar, e uma
 * checagem negativa deixaria ela entrar junto de qualquer origem futura que não seja `typed`. Mesmo
 * formato de `buildFreightRegionCsv`: sem lib externa, testável sem DOM.
 */
/** Colunas do arquivo da câmera: a mesma ordem do CSV, com largura e formato. */
export function buildCameraMeasurementColumns(): readonly SpreadsheetColumn[] {
  return CAMERA_COLUMN_LAYOUT
}

/** As mesmas linhas do CSV, com as quatro medidas em milímetros como número. */
export function buildCameraMeasurementRows(
  entries: readonly CameraMeasurementExportEntry[],
): readonly (readonly SpreadsheetCellValue[])[] {
  return entries
    .filter((entry) => CAMERA_PARTICIPATION_SOURCES.has(entry.source))
    .flatMap((entry) =>
      EXPORT_DIMENSIONS.map((dimension) =>
        toRow(entry, dimension).map((value, index) =>
          index >= CAMERA_NUMERIC_COLUMN_RANGE.first && index <= CAMERA_NUMERIC_COLUMN_RANGE.last
            ? toSpreadsheetNumber(value)
            : value,
        ),
      ),
    )
}

export function buildCameraMeasurementCsv(
  entries: readonly CameraMeasurementExportEntry[],
): string {
  const relevant = entries.filter((entry) => CAMERA_PARTICIPATION_SOURCES.has(entry.source))
  const header = CAMERA_MEASUREMENT_EXPORT_COLUMNS.map(escapeCsvField).join(CSV_FIELD_SEPARATOR)
  const rows = relevant.flatMap((entry) =>
    EXPORT_DIMENSIONS.map((dimension) =>
      toRow(entry, dimension).map(escapeCsvField).join(CSV_FIELD_SEPARATOR),
    ),
  )

  return `${CSV_BYTE_ORDER_MARK}${[header, ...rows].join(CSV_LINE_SEPARATOR)}`
}
