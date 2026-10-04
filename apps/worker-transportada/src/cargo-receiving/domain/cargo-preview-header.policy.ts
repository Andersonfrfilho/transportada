/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF4 (ADR-0094 §2): a coluna é achada pelo NOME, nunca pela posição. O cabeçalho é a
 * primeira linha (entre as 20 primeiras) com mais colunas mapeadas; toda coluna mapeada que falta
 * é nomeada de uma vez, e coluna mapeada repetida recusa a planilha em vez de escolher uma.
 */
import type { ApiErrorDetail } from '../../shared/api.types.js'
import { CargoPreviewWorkbookError } from './cargo-preview-workbook.error.js'
import type {
  CargoPreviewColumnMap,
  ParseBudget,
  SheetRow,
} from './cargo-preview-workbook.types.js'
import {
  PREVIEW_REQUIRED_FIELDS,
  type PreviewItemField,
} from './contractor-receiving-profile.constant.js'
import { normalizePreviewColumnName } from './preview-column-name.policy.js'

export type ResolvedColumn = {
  readonly column: string
  readonly field: PreviewItemField
  readonly letter: string
}

export type ResolvedHeader = {
  readonly columns: readonly ResolvedColumn[]
  readonly rowNumber: number
}

type MappedColumns = readonly (readonly [PreviewItemField, string])[]

const MISSING_COLUMN_MESSAGE = 'Column not found in the preview header'
const DUPLICATED_COLUMN_MESSAGE = 'Column appears more than once in the preview header'

function mappedEntries(columnMap: CargoPreviewColumnMap): MappedColumns {
  return Object.entries(columnMap).flatMap(([field, column]) =>
    typeof column === 'string' ? [[field as PreviewItemField, column] as const] : [],
  )
}

function lettersByName(row: SheetRow): ReadonlyMap<string, readonly string[]> {
  const byName = new Map<string, string[]>()
  for (const [letter, cell] of row.cells) {
    const name = normalizePreviewColumnName(cell.text)
    const letters = byName.get(name)
    if (letters === undefined) byName.set(name, [letter])
    else letters.push(letter)
  }
  return byName
}

function countMatches(row: SheetRow, mapped: MappedColumns): number {
  const byName = lettersByName(row)
  return mapped.filter(([, column]) => byName.has(normalizePreviewColumnName(column))).length
}

function columnDetails(columns: readonly string[], message: string): readonly ApiErrorDetail[] {
  return [...columns].sort().map((column) => ({ field: column, message }))
}

function refuseColumns(
  code: 'PREVIEW_COLUMN_DUPLICATED' | 'PREVIEW_COLUMN_NOT_FOUND',
  columns: MappedColumns,
): never {
  const message =
    code === 'PREVIEW_COLUMN_NOT_FOUND' ? MISSING_COLUMN_MESSAGE : DUPLICATED_COLUMN_MESSAGE
  throw new CargoPreviewWorkbookError(
    code,
    columnDetails(
      columns.map(([, column]) => column),
      message,
    ),
  )
}

function pickHeaderRow(input: {
  readonly budget: ParseBudget
  readonly headerSearchRows: number
  readonly mapped: MappedColumns
  readonly rows: readonly SheetRow[]
}): SheetRow | undefined {
  let best: SheetRow | undefined
  for (const row of input.rows.filter((item) => item.rowNumber <= input.headerSearchRows)) {
    input.budget.check()
    if (best === undefined || countMatches(row, input.mapped) > countMatches(best, input.mapped)) {
      best = row
    }
  }
  return best
}

export function resolvePreviewHeader(input: {
  readonly budget: ParseBudget
  readonly columnMap: CargoPreviewColumnMap
  readonly headerSearchRows: number
  readonly rows: readonly SheetRow[]
}): ResolvedHeader {
  const mapped = mappedEntries(input.columnMap)
  const unmappedRequired = PREVIEW_REQUIRED_FIELDS.filter(
    (field) => input.columnMap[field] === undefined,
  )
  if (unmappedRequired.length > 0) {
    refuseColumns(
      'PREVIEW_COLUMN_NOT_FOUND',
      unmappedRequired.map((field) => [field, field] as const),
    )
  }
  const best = pickHeaderRow({
    budget: input.budget,
    headerSearchRows: input.headerSearchRows,
    mapped,
    rows: input.rows,
  })
  if (best === undefined) return refuseColumns('PREVIEW_COLUMN_NOT_FOUND', mapped)
  const byName = lettersByName(best)
  const lettersOf = (column: string): readonly string[] =>
    byName.get(normalizePreviewColumnName(column)) ?? []
  const missing = mapped.filter(([, column]) => lettersOf(column).length === 0)
  if (missing.length > 0) refuseColumns('PREVIEW_COLUMN_NOT_FOUND', missing)
  const duplicated = mapped.filter(([, column]) => lettersOf(column).length > 1)
  if (duplicated.length > 0) refuseColumns('PREVIEW_COLUMN_DUPLICATED', duplicated)
  const columns = mapped.map(([field, column]) => ({
    column,
    field,
    letter: lettersOf(column)[0] ?? '',
  }))
  return { columns, rowNumber: best.rowNumber }
}
