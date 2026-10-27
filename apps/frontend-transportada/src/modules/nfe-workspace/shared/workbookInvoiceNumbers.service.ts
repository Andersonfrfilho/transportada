/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Lê os números das notas de uma planilha `.xlsx` no navegador — a planilha semanal do contratante
 * (coluna `DOCUMENTO1`), que decide quais notas o operador emite. Sem biblioteca: o `.xlsx` é um
 * zip, e só as entradas `sharedStrings.xml` e a primeira aba são descomprimidas.
 */

const HEADER_NAMES = new Set(['DOCUMENTO1', 'DOCUMENTO', 'NOTA', 'NF', 'NUMERO', 'NUMERONOTA'])
const MAX_ENTRY_BYTES = 20 * 1024 * 1024
const STORED = 0
const DEFLATED = 8

export class WorkbookReadError extends Error {
  public readonly code: 'INVALID_WORKBOOK' | 'NUMBER_COLUMN_NOT_FOUND'

  constructor(code: 'INVALID_WORKBOOK' | 'NUMBER_COLUMN_NOT_FOUND') {
    super(code)
    this.name = 'WorkbookReadError'
    this.code = code
  }
}

type ZipEntry = Readonly<{
  compressedSize: number
  method: number
  name: string
  offset: number
  size: number
}>

function readZipEntries(bytes: Uint8Array): ReadonlyMap<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      end = index
      break
    }
  }
  if (end < 0) throw new WorkbookReadError('INVALID_WORKBOOK')
  const count = view.getUint16(end + 10, true)
  let cursor = view.getUint32(end + 16, true)
  const entries = new Map<string, ZipEntry>()
  for (let item = 0; item < count; item += 1) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new WorkbookReadError('INVALID_WORKBOOK')
    }
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    entries.set(name, {
      compressedSize: view.getUint32(cursor + 20, true),
      method: view.getUint16(cursor + 10, true),
      name,
      offset: view.getUint32(cursor + 42, true),
      size: view.getUint32(cursor + 24, true),
    })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function readEntryText(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  if (entry.size > MAX_ENTRY_BYTES) throw new WorkbookReadError('INVALID_WORKBOOK')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const start =
    entry.offset +
    30 +
    view.getUint16(entry.offset + 26, true) +
    view.getUint16(entry.offset + 28, true)
  const data = bytes.subarray(start, start + entry.compressedSize)
  if (entry.method === STORED) return new TextDecoder().decode(data)
  if (entry.method !== DEFLATED) throw new WorkbookReadError('INVALID_WORKBOOK')
  const stream = new Blob([data.slice()])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).text()
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function readSharedStrings(xml: string): readonly string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeXml(
      [...(match[1] ?? '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1] ?? '').join(''),
    ),
  )
}

function columnOf(reference: string): string {
  return reference.replace(/[0-9]/g, '')
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
}

export async function readInvoiceNumbersFromWorkbook(
  bytes: Uint8Array,
): Promise<readonly number[]> {
  const entries = readZipEntries(bytes)
  const sheetName = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort()[0]
  const sheet = sheetName === undefined ? undefined : entries.get(sheetName)
  if (sheet === undefined) throw new WorkbookReadError('INVALID_WORKBOOK')
  const sharedEntry = entries.get('xl/sharedStrings.xml')
  const shared =
    sharedEntry === undefined ? [] : readSharedStrings(await readEntryText(bytes, sharedEntry))
  const xml = await readEntryText(bytes, sheet)

  let numberColumn: string | undefined
  const numbers: number[] = []
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    for (const cell of (row[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1] ?? ''
      const reference = /\br="([A-Z]+[0-9]+)"/.exec(attributes)?.[1]
      const type = /\bt="([^"]+)"/.exec(attributes)?.[1]
      const raw = /<v>([\s\S]*?)<\/v>/.exec(cell[2] ?? '')?.[1]
      if (reference === undefined || raw === undefined) continue
      if (numberColumn === undefined) {
        const text =
          type === 's' ? shared[Number(raw)] : type === 'str' ? decodeXml(raw) : undefined
        if (text !== undefined && HEADER_NAMES.has(normalizeHeader(text))) {
          numberColumn = columnOf(reference)
        }
        continue
      }
      if (columnOf(reference) !== numberColumn || type === 's' || type === 'str') continue
      const value = Number(raw)
      if (Number.isInteger(value) && value > 0) numbers.push(value)
    }
  }
  if (numberColumn === undefined) throw new WorkbookReadError('NUMBER_COLUMN_NOT_FOUND')
  return numbers
}
