/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Acha a aba `ESTADOS` e devolve cada linha de dado indexada pelo rótulo do cabeçalho. A aba é
 * resolvida pelo `workbook.xml.rels` — o nome do arquivo não acompanha a ordem das abas, e chutar
 * `sheet3.xml` funciona até a ANP republicar a planilha com as abas em outra ordem. O cabeçalho é
 * achado pelos rótulos, porque o preâmbulo institucional muda de altura entre publicações.
 */
import { readZipEntries } from './xlsx-archive.js'
import { readSharedStrings, readSheetRows, type SheetRow } from './xlsx-sheet.reader.js'

const IDENTIFIER_ATTRIBUTE_PATTERN = /\bId="([^"]*)"/
const NAME_ATTRIBUTE_PATTERN = /\bname="([^"]*)"/
const RELATIONSHIP_ATTRIBUTE_PATTERN = /\br:id="([^"]*)"/
const RELATIONSHIP_PATTERN = /<Relationship\b([^>]*?)\/?>/g
const SHARED_STRINGS_PART = 'xl/sharedStrings.xml'
const SHEET_PATTERN = /<sheet\b([^>]*?)\/?>/g
const TARGET_ATTRIBUTE_PATTERN = /\bTarget="([^"]*)"/
const WORKBOOK_PART = 'xl/workbook.xml'
const WORKBOOK_RELATIONSHIPS_PART = 'xl/_rels/workbook.xml.rels'
const WORKSHEET_BASE = 'xl/'

export type AnpSheetRecord = Readonly<Record<string, string>>

function readPart(input: {
  readonly entries: ReadonlyMap<string, string>
  readonly name: string
}): string {
  const content = input.entries.get(input.name)

  if (content === undefined) {
    throw new Error('ANP_MALFORMED_WORKBOOK')
  }

  return content
}

function resolveSheetPart(input: {
  readonly entries: ReadonlyMap<string, string>
  readonly sheetName: string
}): string {
  const workbook = readPart({ entries: input.entries, name: WORKBOOK_PART })
  const relationships = readPart({ entries: input.entries, name: WORKBOOK_RELATIONSHIPS_PART })
  const sheet = [...workbook.matchAll(SHEET_PATTERN)].find(
    (match) => NAME_ATTRIBUTE_PATTERN.exec(match[1] ?? '')?.[1] === input.sheetName,
  )
  const relationshipId = RELATIONSHIP_ATTRIBUTE_PATTERN.exec(sheet?.[1] ?? '')?.[1]
  const target = [...relationships.matchAll(RELATIONSHIP_PATTERN)]
    .map((match) => match[1] ?? '')
    .find((attributes) => IDENTIFIER_ATTRIBUTE_PATTERN.exec(attributes)?.[1] === relationshipId)

  const path = TARGET_ATTRIBUTE_PATTERN.exec(target ?? '')?.[1]

  if (path === undefined) {
    throw new Error('ANP_MISSING_STATE_SHEET')
  }

  return path.startsWith('/') ? path.slice(1) : `${WORKSHEET_BASE}${path}`
}

function locateHeader(input: {
  readonly headerLabels: readonly string[]
  readonly rows: readonly SheetRow[]
}): { readonly index: number; readonly labelByColumn: ReadonlyMap<string, string> } {
  for (const [index, row] of input.rows.entries()) {
    const labelByColumn = new Map(row.cells.map((cell) => [cell.column, cell.text.trim()]))
    const labels = new Set(labelByColumn.values())

    if (input.headerLabels.every((label) => labels.has(label))) {
      return { index, labelByColumn }
    }
  }

  throw new Error('ANP_UNEXPECTED_HEADER')
}

export function readAnpSheetRecords(input: {
  readonly anchorLabel: string
  readonly bytes: Uint8Array
  readonly headerLabels: readonly string[]
  readonly sheetName: string
}): readonly AnpSheetRecord[] {
  const entries = readZipEntries({ bytes: input.bytes })
  const sharedStrings = readSharedStrings(entries.get(SHARED_STRINGS_PART) ?? '')
  const rows = readSheetRows({
    sharedStrings,
    xml: readPart({
      entries,
      name: resolveSheetPart({ entries, sheetName: input.sheetName }),
    }),
  })
  const header = locateHeader({ headerLabels: input.headerLabels, rows })
  const records: AnpSheetRecord[] = []

  for (const row of rows.slice(header.index + 1)) {
    const record: Record<string, string> = {}

    for (const cell of row.cells) {
      const label = header.labelByColumn.get(cell.column)

      if (label !== undefined) {
        record[label] = cell.text.trim()
      }
    }

    if (record[input.anchorLabel] !== undefined) {
      records.push(record)
    }
  }

  return records
}
