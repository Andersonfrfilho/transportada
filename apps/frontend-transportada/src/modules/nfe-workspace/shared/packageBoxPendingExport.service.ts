/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CSV_BYTE_ORDER_MARK,
  CSV_FIELD_SEPARATOR,
  CSV_LINE_SEPARATOR,
  escapeCsvField,
} from '@/modules/shared/csv.service'

import type { PackageBox } from './packageBoxClient.service'

/**
 * ⚠️ `GET /nfe-package-boxes` não tem paginação por cursor — só um teto de itens por chamada
 * (`MAX_LIMIT` em `package-box.schema.ts`, API). Passar o teto aqui é o máximo que a API de hoje
 * entrega numa chamada só; uma empresa com mais de 200 caixas pendentes exigiria um endpoint com
 * paginação de verdade para o arquivo cobrir 100% da fila — fora do escopo desta tarefa.
 */
export const PACKAGE_BOX_PENDING_EXPORT_LIMIT = 200

/** A API não pagina esta lista: bater no teto é o único sinal de que ficou caixa de fora. */
export function isPackageBoxPendingExportTruncated(count: number): boolean {
  return count >= PACKAGE_BOX_PENDING_EXPORT_LIMIT
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
