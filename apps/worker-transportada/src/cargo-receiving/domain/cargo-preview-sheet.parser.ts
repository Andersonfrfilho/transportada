/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF4 (ADR-0094 §7): a aba é varrida por linha. A real reserva 13,8 mil linhas vazias e o
 * parse inteiro custou 237 ms e 80 MB; aqui só linha com `<v>` ou `<is>` passa pelo parser, e a
 * leitura é só do valor em cache — `<f>` nunca é lido, célula de erro é ausente.
 */
import { CargoPreviewWorkbookError } from './cargo-preview-workbook.error.js'
import type {
  CargoPreviewWorkbookLimits,
  ParseBudget,
  SheetCell,
  SheetRow,
} from './cargo-preview-workbook.types.js'
import {
  asList,
  asRecord,
  parseXmlPart,
  readNodeText,
  readRichText,
} from './cargo-preview-xml.parser.js'

type ReadSheetRowsParams = {
  readonly budget: ParseBudget
  readonly limits: Pick<
    CargoPreviewWorkbookLimits,
    'cellTextLength' | 'lastDataRow' | 'rowCells' | 'totalCells'
  >
  readonly sharedStrings: readonly string[]
  readonly xml: string
}

type RowSegment = {
  readonly body: string | undefined
  readonly next: number
  readonly openTag: string
}

const ROW_OPEN = '<row'
const ROW_CLOSE = '</row>'
const SHEET_DATA_CLOSE = '</sheetData>'
const ROW_NUMBER_ATTRIBUTE = /\sr=["'](\d+)["']/u
const CELL_COLUMN = /^([A-Z]{1,3})\d*$/u
const ROW_TAG_BOUNDARY = /[\s>/]/u
const BUDGET_CHECK_INTERVAL = 1024
/** Contada no texto, antes do parser: o `fast-xml-parser` é síncrono e não para no meio da linha. */
const CELL_TAG = /<(?:[\w.-]+:)?c[\s>/]/gu

function nextRowSegment(xml: string, from: number): RowSegment | undefined {
  let start = xml.indexOf(ROW_OPEN, from)
  while (start >= 0 && !ROW_TAG_BOUNDARY.test(xml[start + ROW_OPEN.length] ?? '')) {
    start = xml.indexOf(ROW_OPEN, start + ROW_OPEN.length)
  }
  if (start < 0) return undefined
  const tagEnd = xml.indexOf('>', start)
  if (tagEnd < 0) throw new CargoPreviewWorkbookError('PREVIEW_NOT_A_WORKBOOK')
  const openTag = xml.slice(start, tagEnd + 1)
  if (openTag.endsWith('/>')) return { body: undefined, next: tagEnd + 1, openTag }
  const close = xml.indexOf(ROW_CLOSE, tagEnd)
  if (close < 0) throw new CargoPreviewWorkbookError('PREVIEW_NOT_A_WORKBOOK')
  return {
    body: xml.slice(start, close + ROW_CLOSE.length),
    next: close + ROW_CLOSE.length,
    openTag,
  }
}

function hasValue(body: string | undefined): body is string {
  return body !== undefined && (body.includes('<v') || body.includes('<is'))
}

function columnIndex(letters: string): number {
  let index = 0
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index - 1
}

function columnLetters(index: number): string {
  let remaining = index + 1
  let letters = ''
  while (remaining > 0) {
    letters = String.fromCharCode(65 + ((remaining - 1) % 26)) + letters
    remaining = Math.floor((remaining - 1) / 26)
  }
  return letters
}

function readCell(
  cell: Readonly<Record<string, unknown>>,
  sharedStrings: readonly string[],
): SheetCell | undefined {
  const type = cell['@t']
  if (type === 'e') return undefined
  if (type === 'inlineStr') return { isNumeric: false, text: readRichText(cell['is']) }
  const value = readNodeText(cell['v'])
  if (type !== 's') return { isNumeric: type === undefined || type === 'n', text: value }
  const shared = sharedStrings[Number(value)]
  if (!/^\d+$/u.test(value) || shared === undefined) {
    throw new CargoPreviewWorkbookError('PREVIEW_NOT_A_WORKBOOK')
  }
  return { isNumeric: false, text: shared }
}

/** Para de contar no primeiro passo além do teto: a linha de 760 mil células não é varrida inteira. */
function countCellTags(body: string, maxCells: number): number {
  const tags = new RegExp(CELL_TAG)
  let count = 0
  while (count <= maxCells && tags.exec(body) !== null) count += 1
  return count
}

function readRowCells(body: string, params: ReadSheetRowsParams): ReadonlyMap<string, SheetCell> {
  const cells = new Map<string, SheetCell>()
  let previousColumn = -1
  for (const item of asList(asRecord(parseXmlPart(body)['row'])?.['c'])) {
    const cell = asRecord(item) ?? {}
    const letters = CELL_COLUMN.exec(String(cell['@r'] ?? ''))?.[1]
    previousColumn = letters === undefined ? previousColumn + 1 : columnIndex(letters)
    const value = readCell(cell, params.sharedStrings)
    if (value === undefined || value.text.length === 0) continue
    if (value.text.length > params.limits.cellTextLength)
      throw new CargoPreviewWorkbookError('PREVIEW_CELL_TOO_LONG')
    cells.set(columnLetters(previousColumn), value)
  }
  return cells
}

/** Só as linhas com dado, até a última; linha com dado depois do teto recusa a planilha. */
export function readSheetRows(params: ReadSheetRowsParams): readonly SheetRow[] {
  const rows: SheetRow[] = []
  const dataEnd = params.xml.indexOf(SHEET_DATA_CLOSE)
  const xml = dataEnd < 0 ? params.xml : params.xml.slice(0, dataEnd)
  const { limits } = params
  let rowNumber = 0
  let scanned = 0
  let remainingCells = limits.totalCells
  let segment = nextRowSegment(xml, 0)
  while (segment !== undefined) {
    rowNumber = Number(ROW_NUMBER_ATTRIBUTE.exec(segment.openTag)?.[1] ?? rowNumber + 1)
    scanned += 1
    if (scanned % BUDGET_CHECK_INTERVAL === 0) params.budget.check()
    if (hasValue(segment.body)) {
      const cellCount = countCellTags(segment.body, Math.min(limits.rowCells, remainingCells))
      remainingCells -= cellCount
      if (cellCount > limits.rowCells || remainingCells < 0) {
        throw new CargoPreviewWorkbookError('PREVIEW_TOO_MANY_CELLS')
      }
      const cells = readRowCells(segment.body, params)
      if (cells.size > 0 && rowNumber > limits.lastDataRow) {
        throw new CargoPreviewWorkbookError('PREVIEW_TOO_MANY_ROWS')
      }
      if (cells.size > 0) rows.push({ cells, rowNumber })
      params.budget.check()
    }
    segment = nextRowSegment(xml, segment.next)
  }
  return rows
}
