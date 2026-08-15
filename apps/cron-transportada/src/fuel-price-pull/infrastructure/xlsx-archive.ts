/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Leitor de ZIP suficiente para um `.xlsx`: diretório central e `inflateRawSync`. Existe para não
 * arrastar uma dependência de planilha inteira — a ADR-0033 mediu que o arquivo da ANP usa só
 * deflate cru, que o Bun já traz em `node:zlib`.
 */
import { inflateRawSync } from 'node:zlib'

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const CENTRAL_ENTRY_HEADER_SIZE = 46
const DEFLATE_METHOD = 8
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const END_OF_CENTRAL_DIRECTORY_SIZE = 22
const LOCAL_ENTRY_HEADER_SIZE = 30
const MAXIMUM_COMMENT_LENGTH = 0xffff
const STORE_METHOD = 0

function locateEndOfCentralDirectory(view: Buffer): number {
  const last = view.length - END_OF_CENTRAL_DIRECTORY_SIZE
  const earliest = Math.max(0, last - MAXIMUM_COMMENT_LENGTH)

  for (let offset = last; offset >= earliest; offset -= 1) {
    if (view.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset
    }
  }

  throw new Error('XLSX_NOT_A_ZIP')
}

function decompress(input: { readonly body: Buffer; readonly method: number }): string {
  if (input.method === STORE_METHOD) {
    return input.body.toString('utf8')
  }

  if (input.method === DEFLATE_METHOD) {
    return inflateRawSync(input.body).toString('utf8')
  }

  throw new Error('XLSX_UNSUPPORTED_COMPRESSION')
}

function readEntry(input: { readonly cursor: number; readonly view: Buffer }): {
  readonly content: string
  readonly name: string
  readonly nextCursor: number
} {
  const { cursor, view } = input

  if (view.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_SIGNATURE) {
    throw new Error('XLSX_CORRUPT_DIRECTORY')
  }

  const compressedSize = view.readUInt32LE(cursor + 20)
  const nameLength = view.readUInt16LE(cursor + 28)
  const extraLength = view.readUInt16LE(cursor + 30)
  const commentLength = view.readUInt16LE(cursor + 32)
  const localOffset = view.readUInt32LE(cursor + 42)
  const bodyStart =
    localOffset +
    LOCAL_ENTRY_HEADER_SIZE +
    view.readUInt16LE(localOffset + 26) +
    view.readUInt16LE(localOffset + 28)

  return {
    content: decompress({
      body: view.subarray(bodyStart, bodyStart + compressedSize),
      method: view.readUInt16LE(cursor + 10),
    }),
    name: view.toString(
      'utf8',
      cursor + CENTRAL_ENTRY_HEADER_SIZE,
      cursor + CENTRAL_ENTRY_HEADER_SIZE + nameLength,
    ),
    nextCursor: cursor + CENTRAL_ENTRY_HEADER_SIZE + nameLength + extraLength + commentLength,
  }
}

export function readZipEntries(input: { readonly bytes: Uint8Array }): ReadonlyMap<string, string> {
  const view = Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength)
  const endOffset = locateEndOfCentralDirectory(view)
  const entryCount = view.readUInt16LE(endOffset + 10)
  const entries = new Map<string, string>()
  let cursor = view.readUInt32LE(endOffset + 16)

  for (let index = 0; index < entryCount; index += 1) {
    const { content, name, nextCursor } = readEntry({ cursor, view })
    entries.set(name, content)
    cursor = nextCursor
  }

  return entries
}
