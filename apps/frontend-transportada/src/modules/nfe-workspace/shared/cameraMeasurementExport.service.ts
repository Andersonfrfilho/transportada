/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CSV_BYTE_ORDER_MARK,
  CSV_FIELD_SEPARATOR,
  CSV_LINE_SEPARATOR,
  escapeCsvField,
} from '@/modules/shared/csv.service'

import type { CameraMeasurementExportEntry } from './cameraMeasurementValidation.service'

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

export const CAMERA_MEASUREMENT_EXPORT_FILE_NAME = 'medidas-camera.csv'
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
 * `camera_adjusted`) — `typed` fica fora, não há proposta para comparar. Mesmo formato de
 * `buildFreightRegionCsv`: sem lib externa, testável sem DOM.
 */
export function buildCameraMeasurementCsv(
  entries: readonly CameraMeasurementExportEntry[],
): string {
  const relevant = entries.filter((entry) => entry.source !== 'typed')
  const header = CAMERA_MEASUREMENT_EXPORT_COLUMNS.map(escapeCsvField).join(CSV_FIELD_SEPARATOR)
  const rows = relevant.flatMap((entry) =>
    EXPORT_DIMENSIONS.map((dimension) =>
      toRow(entry, dimension).map(escapeCsvField).join(CSV_FIELD_SEPARATOR),
    ),
  )

  return `${CSV_BYTE_ORDER_MARK}${[header, ...rows].join(CSV_LINE_SEPARATOR)}`
}
