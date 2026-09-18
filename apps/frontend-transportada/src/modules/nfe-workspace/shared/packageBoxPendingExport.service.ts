/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CSV_BYTE_ORDER_MARK,
  CSV_FIELD_SEPARATOR,
  CSV_LINE_SEPARATOR,
  escapeCsvField,
} from '@/modules/shared/csv.service'

import {
  PackageBoxRequestError,
  type PackageBox,
  type PackageBoxPendingExport,
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

export const PACKAGE_BOX_PENDING_EXPORT_CSV_MEDIA_TYPE = 'text/csv;charset=utf-8'

export type PackageBoxPendingExportLabels = Readonly<{
  emptyValue: string
  header: Readonly<Record<PackageBoxPendingExportColumn, string>>
}>

function readCell(
  input: Readonly<{
    box: PackageBox
    column: PackageBoxPendingExportColumn
    labels: PackageBoxPendingExportLabels
  }>,
): number | string {
  const { box, column, labels } = input
  if (column === 'transportedVolumes') return box.transportedVolumes
  if (column === 'description') return box.description || box.productCode
  if (column === 'cartonGtin') return box.cartonGtin ?? labels.emptyValue
  if (column === 'familyKey') return box.familyKey ?? labels.emptyValue
  if (column === 'emitterTaxId') return box.emitterTaxId
  if (column === 'commercialUnit') return box.commercialUnit
  return box.productCode
}

export function buildPackageBoxPendingExportHeader(
  labels: PackageBoxPendingExportLabels,
): readonly string[] {
  return PACKAGE_BOX_PENDING_EXPORT_COLUMNS.map((column) => labels.header[column])
}

/** Uma linha por caixa pendente — `transportedVolumes` sai como número para somar na planilha. */
export function buildPackageBoxPendingExportRows(
  input: Readonly<{ boxes: readonly PackageBox[]; labels: PackageBoxPendingExportLabels }>,
): readonly (readonly (number | string)[])[] {
  return input.boxes.map((box) =>
    PACKAGE_BOX_PENDING_EXPORT_COLUMNS.map((column) =>
      readCell({ box, column, labels: input.labels }),
    ),
  )
}

/** `sheetData` pronto para `write-excel-file` — sem importar a lib no módulo puro. */
export function buildPackageBoxPendingExportSheetData(
  input: Readonly<{ boxes: readonly PackageBox[]; labels: PackageBoxPendingExportLabels }>,
): readonly (readonly (number | string)[])[] {
  return [
    buildPackageBoxPendingExportHeader(input.labels),
    ...buildPackageBoxPendingExportRows(input),
  ]
}

export function buildPackageBoxPendingExportCsv(
  input: Readonly<{ boxes: readonly PackageBox[]; labels: PackageBoxPendingExportLabels }>,
): string {
  const header = buildPackageBoxPendingExportHeader(input.labels).map(escapeCsvField)
  const rows = buildPackageBoxPendingExportRows(input).map((row) =>
    row.map((value) => escapeCsvField(String(value))).join(CSV_FIELD_SEPARATOR),
  )

  return `${CSV_BYTE_ORDER_MARK}${[header.join(CSV_FIELD_SEPARATOR), ...rows].join(CSV_LINE_SEPARATOR)}`
}

/** `YYYY-MM-DD`, sem dado pessoal: a data de hoje identifica o arquivo. */
export function packageBoxPendingExportFileName(
  input: Readonly<{ extension: 'csv' | 'xlsx'; today: string }>,
): string {
  return `medidas-pendentes-caixas-${input.today}.${input.extension}`
}
