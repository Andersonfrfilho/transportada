/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Varredura do XML da aba. Não é um parser de XML de uso geral: lê `<row>`, `<c>` e a tabela de
 * texto compartilhado, que é o que a planilha da ANP usa. Célula de texto guarda um índice para
 * `sharedStrings.xml`, e a numeração das linhas tem buracos — quem consome trabalha por rótulo.
 */
const CELL_PATTERN = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
const COLUMN_PATTERN = /^[A-Z]+/
const ENTITY_BY_NAME: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
}
const ENTITY_PATTERN = /&(amp|apos|gt|lt|quot|#\d+);/g
const REFERENCE_ATTRIBUTE_PATTERN = /\br="([^"]*)"/
const ROW_PATTERN = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g
const SHARED_ITEM_PATTERN = /<si\b[^>]*>([\s\S]*?)<\/si>/g
const SHARED_STRING_TYPE = 's'
const TEXT_PATTERN = /<t\b[^>]*>([\s\S]*?)<\/t>/g
const TYPE_ATTRIBUTE_PATTERN = /\bt="([^"]*)"/
const VALUE_PATTERN = /<v\b[^>]*>([\s\S]*?)<\/v>/

export type SheetCell = {
  readonly column: string
  readonly text: string
}

export type SheetRow = {
  readonly cells: readonly SheetCell[]
}

export function decodeXmlText(value: string): string {
  return value.replace(ENTITY_PATTERN, (match, name: string) =>
    name.startsWith('#')
      ? String.fromCodePoint(Number.parseInt(name.slice(1), 10))
      : (ENTITY_BY_NAME[name] ?? match),
  )
}

function joinTexts(content: string): string {
  const parts: string[] = []

  for (const match of content.matchAll(TEXT_PATTERN)) {
    parts.push(decodeXmlText(match[1] ?? ''))
  }

  return parts.join('')
}

export function readSharedStrings(xml: string): readonly string[] {
  const strings: string[] = []

  for (const match of xml.matchAll(SHARED_ITEM_PATTERN)) {
    strings.push(joinTexts(match[1] ?? ''))
  }

  return strings
}

function readCellText(input: {
  readonly content: string
  readonly sharedStrings: readonly string[]
  readonly type: string | undefined
}): string {
  const value = VALUE_PATTERN.exec(input.content)?.[1]

  if (input.type === SHARED_STRING_TYPE) {
    const index = Number.parseInt(value ?? '', 10)

    return input.sharedStrings[index] ?? ''
  }

  return value === undefined ? joinTexts(input.content) : decodeXmlText(value)
}

function readRowCells(input: {
  readonly content: string
  readonly sharedStrings: readonly string[]
}): readonly SheetCell[] {
  const cells: SheetCell[] = []

  for (const match of input.content.matchAll(CELL_PATTERN)) {
    const attributes = match[1] ?? ''
    const reference = REFERENCE_ATTRIBUTE_PATTERN.exec(attributes)?.[1] ?? ''
    const column = COLUMN_PATTERN.exec(reference)?.[0]
    const text = readCellText({
      content: match[2] ?? '',
      sharedStrings: input.sharedStrings,
      type: TYPE_ATTRIBUTE_PATTERN.exec(attributes)?.[1],
    })

    if (column !== undefined && text !== '') {
      cells.push({ column, text })
    }
  }

  return cells
}

export function readSheetRows(input: {
  readonly sharedStrings: readonly string[]
  readonly xml: string
}): readonly SheetRow[] {
  const rows: SheetRow[] = []

  for (const match of input.xml.matchAll(ROW_PATTERN)) {
    rows.push({
      cells: readRowCells({ content: match[2] ?? '', sharedStrings: input.sharedStrings }),
    })
  }

  return rows
}
