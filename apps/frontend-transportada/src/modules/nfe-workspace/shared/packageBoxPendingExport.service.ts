/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CSV_BYTE_ORDER_MARK,
  CSV_FIELD_SEPARATOR,
  CSV_LINE_SEPARATOR,
  escapeCsvField,
} from '@/modules/shared/csv.service'

import type { SpreadsheetColumn } from '@/modules/shared/spreadsheet/spreadsheetLayout.service'

import {
  PackageBoxRequestError,
  type PackageBox,
  type PackageBoxPendingExport,
  type PackageBoxStatusFilter,
} from './packageBoxClient.service'

const TOO_MANY_REQUESTS_STATUS = 429

/** O arquivo sai em um dos dois formatos — é também o botão que mostra "Preparando…". */
export type PackageBoxPendingExportFormat = 'csv' | 'xlsx'

/** O que a aba diz depois do clique. `idle` também é "baixou inteiro": nada a avisar. */
export type PackageBoxPendingExportFeedback =
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'failed' }>
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'preparing' }>
  | Readonly<{ kind: 'rateLimited' }>
  | Readonly<{ kind: 'truncated'; total: number }>

/**
 * ⚠️ O 429 tem mensagem própria: "falhou" manda clicar de novo na hora, e cada clique antes da
 * janela virar só adia a próxima exportação que passaria.
 */
export function resolvePackageBoxPendingExportFeedback(
  input: Readonly<{
    error: unknown
    isPending: boolean
    result: PackageBoxPendingExport | undefined
  }>,
): PackageBoxPendingExportFeedback {
  if (input.isPending) return { kind: 'preparing' }
  if (input.error instanceof PackageBoxRequestError) {
    return input.error.status === TOO_MANY_REQUESTS_STATUS
      ? { kind: 'rateLimited' }
      : { kind: 'failed' }
  }
  if (input.error !== null && input.error !== undefined) return { kind: 'failed' }
  if (input.result === undefined) return { kind: 'idle' }
  if (input.result.items.length === 0) return { kind: 'empty' }
  if (input.result.truncated) return { kind: 'truncated', total: input.result.items.length }
  return { kind: 'idle' }
}

/** A ordem da lista é a ordem das colunas do arquivo. */
export const PACKAGE_BOX_PENDING_EXPORT_COLUMNS = [
  'productCode',
  'description',
  'cartonGtin',
  'emitterTaxId',
  'familyKey',
  'commercialUnit',
  'transportedVolumes',
] as const
export type PackageBoxPendingExportColumn = (typeof PACKAGE_BOX_PENDING_EXPORT_COLUMNS)[number]

/** Só as situações que têm medida na caixa trazem estas colunas: a fila "Faltam medir" não as tem. */
export const PACKAGE_BOX_MEASUREMENT_EXPORT_COLUMNS = [
  'lengthCm',
  'widthCm',
  'heightCm',
  'unitsPerBox',
  'measuredAt',
  'measuredByName',
] as const
export type PackageBoxMeasurementExportColumn =
  (typeof PACKAGE_BOX_MEASUREMENT_EXPORT_COLUMNS)[number]

type ExportColumn = PackageBoxMeasurementExportColumn | PackageBoxPendingExportColumn

export const PACKAGE_BOX_PENDING_EXPORT_CSV_MEDIA_TYPE = 'text/csv;charset=utf-8'

export type PackageBoxPendingExportLabels = Readonly<{
  emptyValue: string
  header: Readonly<Record<PackageBoxPendingExportColumn, string>>
  measurementHeader: Readonly<Record<PackageBoxMeasurementExportColumn, string>>
}>

type ExportInput = Readonly<{
  boxes: readonly PackageBox[]
  labels: PackageBoxPendingExportLabels
  /** A situação da tela; sem ela, a fila de pendentes de sempre. */
  status?: PackageBoxStatusFilter
}>

function resolveExportColumns(status: PackageBoxStatusFilter | undefined): readonly ExportColumn[] {
  if (status === undefined || status === 'pending') return PACKAGE_BOX_PENDING_EXPORT_COLUMNS
  return [...PACKAGE_BOX_PENDING_EXPORT_COLUMNS, ...PACKAGE_BOX_MEASUREMENT_EXPORT_COLUMNS]
}

function toCentimetres(millimetres: number | null, emptyValue: string): number | string {
  return millimetres === null ? emptyValue : millimetres / 10
}

/** `AAAA-MM-DD` do instante gravado: a planilha ordena e filtra por data, e o fuso não muda o dia. */
function formatExportDate(value: string | null, emptyValue: string): string {
  return value === null ? emptyValue : value.slice(0, 10)
}

function readCell(
  input: Readonly<{
    box: PackageBox
    column: ExportColumn
    labels: PackageBoxPendingExportLabels
  }>,
): number | string {
  const { box, column, labels } = input
  if (column === 'lengthCm') return toCentimetres(box.lengthMm, labels.emptyValue)
  if (column === 'widthCm') return toCentimetres(box.widthMm, labels.emptyValue)
  if (column === 'heightCm') return toCentimetres(box.heightMm, labels.emptyValue)
  if (column === 'unitsPerBox') return box.unitsPerBox
  if (column === 'measuredAt') return formatExportDate(box.measuredAt, labels.emptyValue)
  if (column === 'measuredByName') return box.measuredByName ?? labels.emptyValue
  if (column === 'transportedVolumes') return box.transportedVolumes
  if (column === 'description') return box.description || box.productCode
  if (column === 'cartonGtin') return box.cartonGtin ?? labels.emptyValue
  if (column === 'familyKey') return box.familyKey ?? labels.emptyValue
  if (column === 'emitterTaxId') return box.emitterTaxId
  if (column === 'commercialUnit') return box.commercialUnit
  return box.productCode
}

const EXPORT_COLUMN_LAYOUT: Readonly<Record<ExportColumn, Omit<SpreadsheetColumn, 'header'>>> = {
  cartonGtin: { format: '@', width: 18 },
  commercialUnit: { width: 12 },
  description: { width: 44 },
  emitterTaxId: { format: '@', width: 18 },
  familyKey: { width: 22 },
  heightCm: { align: 'right', format: '0.0', width: 14 },
  lengthCm: { align: 'right', format: '0.0', width: 14 },
  measuredAt: { align: 'center', width: 14 },
  measuredByName: { width: 22 },
  productCode: { format: '@', width: 18 },
  transportedVolumes: { align: 'right', format: '#,##0', width: 16 },
  unitsPerBox: { align: 'right', format: '#,##0', width: 14 },
  widthCm: { align: 'right', format: '0.0', width: 14 },
}

/** Cabeçalho, largura, alinhamento e formato de cada coluna do arquivo da situação escolhida. */
export function buildPackageBoxExportColumns(
  input: Readonly<{ labels: PackageBoxPendingExportLabels; status?: PackageBoxStatusFilter }>,
): readonly SpreadsheetColumn[] {
  const headers = buildPackageBoxPendingExportHeader(input.labels, input.status)
  return resolveExportColumns(input.status).map((column, index) => ({
    ...EXPORT_COLUMN_LAYOUT[column],
    header: headers[index] ?? '',
  }))
}

export function buildPackageBoxPendingExportHeader(
  labels: PackageBoxPendingExportLabels,
  status?: PackageBoxStatusFilter,
): readonly string[] {
  return resolveExportColumns(status).map((column) =>
    column in labels.header
      ? labels.header[column as PackageBoxPendingExportColumn]
      : labels.measurementHeader[column as PackageBoxMeasurementExportColumn],
  )
}

/** Uma linha por caixa pendente — `transportedVolumes` sai como número para somar na planilha. */
export function buildPackageBoxPendingExportRows(
  input: ExportInput,
): readonly (readonly (number | string)[])[] {
  const columns = resolveExportColumns(input.status)
  return input.boxes.map((box) =>
    columns.map((column) => readCell({ box, column, labels: input.labels })),
  )
}

/** `sheetData` pronto para `write-excel-file` — sem importar a lib no módulo puro. */
export function buildPackageBoxPendingExportSheetData(
  input: ExportInput,
): readonly (readonly (number | string)[])[] {
  return [
    buildPackageBoxPendingExportHeader(input.labels, input.status),
    ...buildPackageBoxPendingExportRows(input),
  ]
}

export function buildPackageBoxPendingExportCsv(input: ExportInput): string {
  const header = buildPackageBoxPendingExportHeader(input.labels, input.status).map(escapeCsvField)
  const rows = buildPackageBoxPendingExportRows(input).map((row) =>
    row.map((value) => escapeCsvField(String(value))).join(CSV_FIELD_SEPARATOR),
  )

  return `${CSV_BYTE_ORDER_MARK}${[header.join(CSV_FIELD_SEPARATOR), ...rows].join(CSV_LINE_SEPARATOR)}`
}

/** `YYYY-MM-DD`, sem dado pessoal: a data de hoje identifica o arquivo. */
export function packageBoxPendingExportFileName(
  input: Readonly<{
    extension: 'csv' | 'xlsx'
    status?: PackageBoxStatusFilter
    today: string
  }>,
): string {
  const prefix = PACKAGE_BOX_EXPORT_FILE_PREFIX[input.status ?? 'pending']
  return `${prefix}-${input.today}.${input.extension}`
}

const PACKAGE_BOX_EXPORT_FILE_PREFIX = {
  all: 'caixas',
  measured: 'caixas-medidas',
  pending: 'medidas-pendentes-caixas',
} as const satisfies Record<PackageBoxStatusFilter, string>
