/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia do fixture da API (`apps/api-transportada/test/fixtures/`): uma app não importa código de
 * outra, nem em teste.
 *
 * Spec 237 T4.3: monta, em memória, uma planilha com a estrutura da prévia real (`planilha-fr.md`):
 * aba `IMPORTAÇÃO` com cabeçalho na linha 4, linhas de cabeçalho de rota, linhas vazias reservadas,
 * aba `RESULTADO` com `#NAME?`, `vbaProject.bin` de enchimento e `sharedStrings`. Nenhum dado real.
 */
import { strToU8, zipSync, type Zippable } from 'fflate'

import {
  columnLetter,
  escapeXml,
  MAIN_NS,
  SharedStrings,
  XML_DECLARATION,
} from './cargo-preview-xml.fixture.js'

export const FR_HEADER = [
  'RouteName',
  'RoutingDate',
  'Text001',
  'Company',
  'CompanyName',
  'PESO TOTAL',
  'VOLUME(M3)',
  'VALOR',
  'ENDEREÇO',
  'Comment16',
  'City',
  'State',
  'PostalCode',
] as const

export const FR_COLUMN_MAP = {
  address: 'ENDEREÇO',
  city: 'City',
  contractorReference: 'Text001',
  neighborhood: 'Comment16',
  postalCode: 'PostalCode',
  recipientCode: 'Company',
  recipientName: 'CompanyName',
  routeName: 'RouteName',
  routingDate: 'RoutingDate',
  state: 'State',
  value: 'VALOR',
  volumeM3: 'VOLUME(M3)',
  weightKg: 'PESO TOTAL',
} as const

export const IMPORT_SHEET_NAME = 'IMPORTAÇÃO'
export const RESULT_SHEET_NAME = 'RESULTADO'
export const SHEET_ENTRY = 'xl/worksheets/sheet1.xml'
export const SHARED_STRINGS_ENTRY = 'xl/sharedStrings.xml'
export const MACRO_ENTRY = 'xl/vbaProject.bin'

/** Célula especial: string inline, erro, fórmula com valor em cache, ou número com o `<v>` literal. */
export type FixtureCell =
  | number
  | string
  | { readonly error: string }
  | { readonly raw: string }
  | { readonly formula: string; readonly cached: number | string }
  | { readonly inline: string }

export type FixtureRow = Readonly<Record<string, FixtureCell | undefined>>

export type BuildWorkbookOptions = {
  readonly entries?: Readonly<Record<string, Uint8Array>>
  readonly header?: readonly string[]
  readonly headerRowNumber?: number
  readonly macro?: Uint8Array
  readonly reservedEmptyRows?: number
  readonly resultSheetXml?: string
  readonly rows?: readonly FixtureRow[]
  /** Linhas com número fixo (ex.: uma linha muito abaixo), na ordem dada. */
  readonly rowsAt?: readonly { readonly rowNumber: number; readonly row: FixtureRow }[]
  readonly sheetName?: string
  /** Texto inserido logo depois da declaração XML de `sharedStrings.xml` (ex.: um DOCTYPE). */
  readonly sharedStringsPrologue?: string
}

const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function cellXml(input: { cell: FixtureCell; reference: string; strings: SharedStrings }): string {
  const { cell, reference, strings } = input
  if (typeof cell === 'number') return `<c r="${reference}"><v>${cell}</v></c>`
  if (typeof cell === 'string') {
    return `<c r="${reference}" s="8" t="s"><v>${strings.indexOf(cell)}</v></c>`
  }
  if ('error' in cell) return `<c r="${reference}" t="e"><v>${escapeXml(cell.error)}</v></c>`
  if ('raw' in cell) return `<c r="${reference}"><v>${escapeXml(cell.raw)}</v></c>`
  if ('inline' in cell) {
    return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(cell.inline)}</t></is></c>`
  }
  const type = typeof cell.cached === 'string' ? ' t="str"' : ''
  return `<c r="${reference}"${type}><f>${escapeXml(cell.formula)}</f><v>${escapeXml(String(cell.cached))}</v></c>`
}

function rowXml(input: {
  header: readonly string[]
  row: FixtureRow
  rowNumber: number
  strings: SharedStrings
}): string {
  const cells = input.header.map((column, index) => {
    const reference = `${columnLetter(index)}${input.rowNumber}`
    const cell = input.row[column]
    return cell === undefined
      ? `<c r="${reference}"/>`
      : cellXml({ cell, reference, strings: input.strings })
  })
  return `<row r="${input.rowNumber}" spans="1:${input.header.length}" x14ac:dyDescent="0.25">${cells.join('')}</row>`
}

function sheetXml(options: BuildWorkbookOptions, strings: SharedStrings): string {
  const header = options.header ?? FR_HEADER
  const headerRowNumber = options.headerRowNumber ?? 4
  const parts: string[] = []
  for (let rowNumber = 1; rowNumber < headerRowNumber; rowNumber += 1) {
    parts.push(`<row r="${rowNumber}"><c r="N${rowNumber}" s="7"/></row>`)
  }
  const headerRow = Object.fromEntries(header.map((column) => [column, column]))
  parts.push(rowXml({ header, row: headerRow, rowNumber: headerRowNumber, strings }))
  let rowNumber = headerRowNumber
  for (const row of options.rows ?? []) {
    rowNumber += 1
    parts.push(rowXml({ header, row, rowNumber, strings }))
  }
  for (let index = 0; index < (options.reservedEmptyRows ?? 2000); index += 1) {
    rowNumber += 1
    parts.push(rowXml({ header, row: {}, rowNumber, strings }))
  }
  for (const fixed of options.rowsAt ?? []) {
    parts.push(rowXml({ header, row: fixed.row, rowNumber: fixed.rowNumber, strings }))
  }
  return `${XML_DECLARATION}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac"><dimension ref="A1:N${rowNumber}"/><sheetData>${parts.join('')}</sheetData></worksheet>`
}

const RESULT_SHEET_XML = `${XML_DECLARATION}<worksheet xmlns="${MAIN_NS}"><sheetData><row r="3"><c r="A3" t="e"><v>#NAME?</v></c><c r="B3" t="e"><v>#NAME?</v></c></row></sheetData></worksheet>`

function workbookEntries(sheetName: string): Zippable {
  const workbook = `${XML_DECLARATION}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/><sheet name="${RESULT_SHEET_NAME}" sheetId="4" r:id="rId2"/></sheets></workbook>`
  const relationship = (id: string, type: string, target: string): string =>
    `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`
  const rels = `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[
    relationship(
      'rId8',
      'http://schemas.microsoft.com/office/2006/relationships/vbaProject',
      'vbaProject.bin',
    ),
    relationship('rId7', `${REL_NS}/sharedStrings`, 'sharedStrings.xml'),
    relationship('rId2', `${REL_NS}/worksheet`, 'worksheets/sheet2.xml'),
    relationship('rId1', `${REL_NS}/worksheet`, '/xl/worksheets/sheet1.xml'),
  ].join('')}</Relationships>`
  return {
    '[Content_Types].xml': strToU8(`${XML_DECLARATION}<Types/>`),
    'xl/_rels/workbook.xml.rels': strToU8(rels),
    'xl/workbook.xml': strToU8(workbook),
  }
}

/** A planilha inteira, como bytes de um `.xlsm`. */
export function buildCargoPreviewWorkbook(options: BuildWorkbookOptions = {}): Uint8Array {
  const strings = new SharedStrings()
  const sheet = sheetXml(options, strings)
  const files: Zippable = {
    ...workbookEntries(options.sheetName ?? IMPORT_SHEET_NAME),
    [SHARED_STRINGS_ENTRY]: strToU8(
      strings
        .toXml()
        .replace(XML_DECLARATION, `${XML_DECLARATION}${options.sharedStringsPrologue ?? ''}`),
    ),
    [SHEET_ENTRY]: strToU8(sheet),
    [MACRO_ENTRY]: options.macro ?? strToU8('VBA-FILLER-'.repeat(200)),
    'xl/worksheets/sheet2.xml': strToU8(options.resultSheetXml ?? RESULT_SHEET_XML),
    ...options.entries,
  }
  return zipSync(files, { level: 6 })
}

export function zipEntries(entries: Readonly<Record<string, Uint8Array>>): Uint8Array {
  return zipSync({ ...entries }, { level: 6 })
}
