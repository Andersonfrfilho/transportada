/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.1 (ADR-0094 §7): o diretório central é lido aqui, e não pelo `unzipSync` do `fflate`,
 * que confia no tamanho declarado e decodifica o fluxo inteiro mesmo quando a saída estoura. Só a
 * entrada pedida é descomprimida, em fatias contadas; o resto do zip (a macro) nunca é tocado.
 */
import { Inflate } from 'fflate'

import { INFLATE_SLICE_BYTES } from './cargo-preview-workbook.constant.js'
import { CargoPreviewWorkbookError } from './cargo-preview-workbook.error.js'
import type { ParseBudget } from './cargo-preview-workbook.types.js'

export type ZipEntry = {
  readonly compressedSize: number
  readonly flags: number
  readonly localHeaderOffset: number
  readonly method: number
  readonly name: string
  readonly uncompressedSize: number
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
const END_SIGNATURE = 0x06054b50
const END_RECORD_SIZE = 22
const MAX_COMMENT_SIZE = 0xffff
const CENTRAL_HEADER_SIZE = 46
const LOCAL_HEADER_SIZE = 30
const ZIP64_COUNT = 0xffff
const ZIP64_SIZE = 0xffffffff
const ENCRYPTED_FLAG = 1
const STORED = 0
const DEFLATED = 8
const NAME_DECODER = new TextDecoder('utf-8')

function notAWorkbook(): CargoPreviewWorkbookError {
  return new CargoPreviewWorkbookError('PREVIEW_NOT_A_WORKBOOK')
}

function findEndRecord(view: DataView): number {
  const lowest = Math.max(0, view.byteLength - END_RECORD_SIZE - MAX_COMMENT_SIZE)
  for (let offset = view.byteLength - END_RECORD_SIZE; offset >= lowest; offset -= 1) {
    if (view.getUint32(offset, true) === END_SIGNATURE) return offset
  }
  throw notAWorkbook()
}

/** Zip-slip: nada é escrito em disco, mas caminho de fuga recusa o arquivo inteiro. */
export function isUnsafeEntryName(name: string): boolean {
  if (name.length === 0 || name.includes('\\') || name.includes('\0')) return true
  if (name.startsWith('/') || /^[A-Za-z]:/u.test(name)) return true
  return name.split('/').includes('..')
}

function readCentralHeader(view: DataView, offset: number): { entry: ZipEntry; next: number } {
  if (offset + CENTRAL_HEADER_SIZE > view.byteLength) throw notAWorkbook()
  if (view.getUint32(offset, true) !== CENTRAL_HEADER_SIGNATURE) throw notAWorkbook()
  const nameLength = view.getUint16(offset + 28, true)
  const nameStart = offset + CENTRAL_HEADER_SIZE
  if (nameStart + nameLength > view.byteLength) throw notAWorkbook()
  const nameBytes = new Uint8Array(view.buffer, view.byteOffset + nameStart, nameLength)
  const entry: ZipEntry = {
    compressedSize: view.getUint32(offset + 20, true),
    flags: view.getUint16(offset + 8, true),
    localHeaderOffset: view.getUint32(offset + 42, true),
    method: view.getUint16(offset + 10, true),
    name: NAME_DECODER.decode(nameBytes),
    uncompressedSize: view.getUint32(offset + 24, true),
  }
  const trailing = view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  return { entry, next: nameStart + nameLength + trailing }
}

export function readZipDirectory(input: {
  readonly bytes: Uint8Array
  readonly maxEntries: number
}): ReadonlyMap<string, ZipEntry> {
  const view = new DataView(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength)
  const end = findEndRecord(view)
  const count = view.getUint16(end + 10, true)
  const directoryOffset = view.getUint32(end + 16, true)
  if (count === ZIP64_COUNT || directoryOffset === ZIP64_SIZE) throw notAWorkbook()
  if (count > input.maxEntries) throw new CargoPreviewWorkbookError('PREVIEW_TOO_MANY_ENTRIES')

  const entries = new Map<string, ZipEntry>()
  let offset = directoryOffset
  for (let index = 0; index < count; index += 1) {
    const { entry, next } = readCentralHeader(view, offset)
    if (isUnsafeEntryName(entry.name) || entries.has(entry.name)) {
      throw new CargoPreviewWorkbookError('PREVIEW_ZIP_ENTRY_UNSAFE')
    }
    entries.set(entry.name, entry)
    offset = next
  }
  return entries
}

function locateData(view: DataView, entry: ZipEntry): number {
  const offset = entry.localHeaderOffset
  if (offset + LOCAL_HEADER_SIZE > view.byteLength) throw notAWorkbook()
  if (view.getUint32(offset, true) !== LOCAL_HEADER_SIGNATURE) throw notAWorkbook()
  const start =
    offset +
    LOCAL_HEADER_SIZE +
    view.getUint16(offset + 26, true) +
    view.getUint16(offset + 28, true)
  if (start + entry.compressedSize > view.byteLength) throw notAWorkbook()
  return start
}

function concatenate(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const output = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

function inflateCounted(input: {
  readonly budget: ParseBudget
  readonly compressed: Uint8Array
  readonly expectedSize: number
}): Uint8Array {
  const chunks: Uint8Array[] = []
  let produced = 0
  const inflate = new Inflate((chunk) => {
    chunks.push(chunk)
    produced += chunk.length
  })
  for (let start = 0; start < input.compressed.length; start += INFLATE_SLICE_BYTES) {
    const end = start + INFLATE_SLICE_BYTES
    inflate.push(input.compressed.subarray(start, end), end >= input.compressed.length)
    if (produced > input.expectedSize) throw new CargoPreviewWorkbookError('PREVIEW_ZIP_BOMB')
    input.budget.check()
  }
  if (produced !== input.expectedSize) throw notAWorkbook()
  return concatenate(chunks, produced)
}

/** Descomprime uma entrada, com o teto antes (declarado) e durante (contado). */
export function extractZipEntry(input: {
  readonly budget: ParseBudget
  readonly bytes: Uint8Array
  readonly entry: ZipEntry
  readonly maxBytes: number
}): Uint8Array {
  const { entry } = input
  if ((entry.flags & ENCRYPTED_FLAG) !== 0) throw notAWorkbook()
  if (entry.uncompressedSize > input.maxBytes)
    throw new CargoPreviewWorkbookError('PREVIEW_ZIP_BOMB')
  const view = new DataView(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength)
  const start = locateData(view, entry)
  const compressed = input.bytes.subarray(start, start + entry.compressedSize)
  if (entry.method === STORED) {
    if (entry.compressedSize !== entry.uncompressedSize) throw notAWorkbook()
    return compressed.slice()
  }
  if (entry.method !== DEFLATED) throw notAWorkbook()
  try {
    return inflateCounted({
      budget: input.budget,
      compressed,
      expectedSize: entry.uncompressedSize,
    })
  } catch (error) {
    if (error instanceof CargoPreviewWorkbookError) throw error
    throw notAWorkbook()
  }
}
