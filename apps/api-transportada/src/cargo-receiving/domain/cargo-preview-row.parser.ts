/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF4: cada linha depois do cabeçalho vira um item ou os seus erros — nunca derruba a
 * planilha. Linha vazia e cabeçalho de rota (só rota e data) são ignorados, não são erro.
 */
import type { ResolvedColumn, ResolvedHeader } from './cargo-preview-header.policy.js'
import {
  PREVIEW_DECIMAL_FIELDS,
  PREVIEW_TEXT_FIELD_MAX_LENGTH,
} from './cargo-preview-workbook.constant.js'
import type {
  CargoPreviewRow,
  CargoPreviewRowError,
  SheetCell,
  SheetRow,
} from './cargo-preview-workbook.types.js'
import {
  normalizePlaceName,
  normalizeText,
  readCode,
  readExcelDate,
  readNonNegativeDecimal,
  readPostalCode,
  readStateCode,
} from './cargo-preview-value.policy.js'
import {
  PREVIEW_ITEM_FIELDS,
  type PreviewItemField,
} from './contractor-receiving-profile.constant.js'

type FieldReading = { readonly error: string } | { readonly value: string }
type FieldReader = (cell: SheetCell) => FieldReading

const ROUTE_HEADER_FIELDS: ReadonlySet<PreviewItemField> = new Set(['routeName', 'routingDate'])
const REQUIRED_ITEM_FIELDS: ReadonlySet<PreviewItemField> = new Set([
  'routeName',
  'value',
  'weightKg',
])
const REQUIRED_MESSAGE = 'A value is required'
const DECIMAL_MESSAGE = 'Must be a non-negative decimal number'

function decimal(field: keyof typeof PREVIEW_DECIMAL_FIELDS): FieldReader {
  const { maxIntegerDigits, scale } = PREVIEW_DECIMAL_FIELDS[field]
  return (cell) => {
    const reading = readNonNegativeDecimal({ cell, maxIntegerDigits, scale })
    if (reading.kind === 'value') return { value: reading.text }
    return reading.kind === 'too_large'
      ? { error: `Must have at most ${maxIntegerDigits} digits before the decimal separator` }
      : { error: DECIMAL_MESSAGE }
  }
}

function limited(read: (cell: SheetCell) => string, maxLength: number): FieldReader {
  return (cell) => {
    const value = read(cell)
    return value.length > maxLength
      ? { error: `Must have at most ${maxLength} characters` }
      : { value }
  }
}

function optionalFormat(
  read: (cell: SheetCell) => string | undefined,
  message: string,
): FieldReader {
  return (cell) => {
    const value = read(cell)
    return value === undefined ? { error: message } : { value }
  }
}

const FIELD_READERS: Readonly<Record<PreviewItemField, FieldReader>> = {
  address: limited((cell) => normalizeText(cell.text), PREVIEW_TEXT_FIELD_MAX_LENGTH.address),
  city: limited((cell) => normalizePlaceName(cell.text), PREVIEW_TEXT_FIELD_MAX_LENGTH.city),
  contractorReference: limited(readCode, PREVIEW_TEXT_FIELD_MAX_LENGTH.contractorReference),
  neighborhood: limited(
    (cell) => normalizeText(cell.text),
    PREVIEW_TEXT_FIELD_MAX_LENGTH.neighborhood,
  ),
  postalCode: optionalFormat(readPostalCode, 'Must be a postal code with 8 digits'),
  recipientCode: limited(readCode, PREVIEW_TEXT_FIELD_MAX_LENGTH.recipientCode),
  recipientName: limited(
    (cell) => normalizeText(cell.text),
    PREVIEW_TEXT_FIELD_MAX_LENGTH.recipientName,
  ),
  routeName: limited((cell) => normalizeText(cell.text), PREVIEW_TEXT_FIELD_MAX_LENGTH.routeName),
  routingDate: optionalFormat(readExcelDate, 'Must be an Excel date'),
  state: optionalFormat(readStateCode, 'Must be a two-letter state code'),
  value: decimal('value'),
  volumeM3: decimal('volumeM3'),
  weightKg: decimal('weightKg'),
}

function presentCells(
  row: SheetRow,
  columns: readonly ResolvedColumn[],
): ReadonlyMap<PreviewItemField, SheetCell> {
  const present = new Map<PreviewItemField, SheetCell>()
  for (const column of columns) {
    const cell = row.cells.get(column.letter)
    if (cell !== undefined && normalizeText(cell.text).length > 0) present.set(column.field, cell)
  }
  return present
}

function isIgnoredRow(present: ReadonlyMap<PreviewItemField, SheetCell>): boolean {
  return [...present.keys()].every((field) => ROUTE_HEADER_FIELDS.has(field))
}

function readField(field: PreviewItemField, cell: SheetCell | undefined): FieldReading | undefined {
  if (cell !== undefined) return FIELD_READERS[field](cell)
  return REQUIRED_ITEM_FIELDS.has(field) ? { error: REQUIRED_MESSAGE } : undefined
}

function readItem(row: SheetRow, header: ResolvedHeader): CargoPreviewRow | CargoPreviewRowError[] {
  const present = presentCells(row, header.columns)
  const values = new Map<PreviewItemField, string>()
  const errors: CargoPreviewRowError[] = []
  for (const field of PREVIEW_ITEM_FIELDS) {
    const column = header.columns.find((item) => item.field === field)
    const reading = readField(field, present.get(field))
    if (reading === undefined) continue
    if ('value' in reading) values.set(field, reading.value)
    else
      errors.push({
        column: column?.column ?? field,
        field,
        message: reading.error,
        rowNumber: row.rowNumber,
      })
  }
  if (errors.length > 0) return errors
  return {
    address: values.get('address'),
    city: values.get('city'),
    contractorReference: values.get('contractorReference'),
    neighborhood: values.get('neighborhood'),
    postalCode: values.get('postalCode'),
    recipientCode: values.get('recipientCode'),
    recipientName: values.get('recipientName'),
    routeName: values.get('routeName') ?? '',
    routingDate: values.get('routingDate'),
    rowNumber: row.rowNumber,
    state: values.get('state'),
    value: values.get('value') ?? '',
    volumeM3: values.get('volumeM3'),
    weightKg: values.get('weightKg') ?? '',
  }
}

export function readPreviewItems(input: {
  readonly header: ResolvedHeader
  readonly rows: readonly SheetRow[]
}): {
  readonly rowErrors: readonly CargoPreviewRowError[]
  readonly rows: readonly CargoPreviewRow[]
} {
  const rows: CargoPreviewRow[] = []
  const rowErrors: CargoPreviewRowError[] = []
  for (const row of input.rows) {
    if (row.rowNumber <= input.header.rowNumber) continue
    if (isIgnoredRow(presentCells(row, input.header.columns))) continue
    const item = readItem(row, input.header)
    if (Array.isArray(item)) rowErrors.push(...item)
    else rows.push(item)
  }
  return { rowErrors, rows }
}
