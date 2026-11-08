/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 305: o tamanho real de cada entrada de um zip, lido do diretório central. Zips feitos em fluxo (Outlook, .NET,
 * vários exportadores de NF-e) gravam `0xFFFFFFFF` nos campos de 32 bits e levam o tamanho de verdade no campo extra
 * Zip64 (id `0x0001`). O `filter` do `fflate` entrega o valor cru de 32 bits — 4 GiB para toda entrada — enquanto a
 * extração em si resolve o Zip64 sozinha. Sem esta leitura, o teto por arquivo recusa um zip são de 389 notas de 50 KB
 * como "grande demais". Pior: se o `filter` aceita a entrada, o `fflate` aloca o buffer de saída com esse valor cru
 * (4 GiB) e o worker morre por falta de memória. Por isso zip em fluxo **não** passa pelo `unzipSync`: a extração é feita
 * aqui, entrada por entrada, com o buffer do tamanho real já conferido contra os tetos. Qualquer coisa fora do normal
 * devolve o diretório vazio e quem chama segue com o valor que o `fflate` deu.
 */
import { inflateSync, type UnzipFileInfo } from 'fflate'

const ZIP32_SENTINEL = 0xffffffff
const EOCD_SIGNATURE = 0x06054b50
const EOCD_MIN_BYTES = 22
const EOCD_MAX_COMMENT = 0xffff
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50
const ZIP64_EOCD_SIGNATURE = 0x06064b50
const CENTRAL_SIGNATURE = 0x02014b50
const CENTRAL_FIXED_BYTES = 46
const ZIP64_EXTRA_ID = 0x0001

export type ZipEntrySizes = { readonly compressedSize: number; readonly originalSize: number }

export function readZipEntrySizes(bytes: Uint8Array): ReadonlyMap<string, ZipEntrySizes> {
  const sizes = new Map<string, ZipEntrySizes>()
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const eocd = findEndOfCentralDirectory(view)
    if (eocd === undefined) return sizes
    let { count, offset } = eocd
    if (count === 0xffff || offset === ZIP32_SENTINEL) {
      const zip64 = readZip64EndOfCentralDirectory(view, eocd.position)
      if (zip64 === undefined) return sizes
      ;({ count, offset } = zip64)
    }
    const decoder = new TextDecoder()
    let cursor = offset
    for (let index = 0; index < count; index += 1) {
      if (cursor + CENTRAL_FIXED_BYTES > view.byteLength) return sizes
      if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) return sizes
      const compressed = view.getUint32(cursor + 20, true)
      const original = view.getUint32(cursor + 24, true)
      const nameLength = view.getUint16(cursor + 28, true)
      const extraLength = view.getUint16(cursor + 30, true)
      const commentLength = view.getUint16(cursor + 32, true)
      const nameStart = cursor + CENTRAL_FIXED_BYTES
      const extraStart = nameStart + nameLength
      const next = extraStart + extraLength + commentLength
      if (next > view.byteLength) return sizes
      const name = decoder.decode(bytes.subarray(nameStart, extraStart))
      sizes.set(name, resolveEntry({ compressed, extraLength, extraStart, original, view }))
      cursor = next
    }
  } catch {
    return new Map()
  }
  return sizes
}

/** Os tamanhos efetivos de uma entrada: o do Zip64 quando o campo de 32 bits é o marcador, senão o que o `fflate` deu. */
export function effectiveEntrySizes(
  info: UnzipFileInfo,
  resolved: ReadonlyMap<string, ZipEntrySizes>,
): ZipEntrySizes {
  const fromDirectory = resolved.get(info.name)
  return {
    compressedSize:
      info.size === ZIP32_SENTINEL && fromDirectory !== undefined
        ? fromDirectory.compressedSize
        : info.size,
    originalSize:
      info.originalSize === ZIP32_SENTINEL && fromDirectory !== undefined
        ? fromDirectory.originalSize
        : info.originalSize,
  }
}

function findEndOfCentralDirectory(
  view: DataView,
): { count: number; offset: number; position: number } | undefined {
  const lowest = Math.max(0, view.byteLength - EOCD_MIN_BYTES - EOCD_MAX_COMMENT)
  for (let position = view.byteLength - EOCD_MIN_BYTES; position >= lowest; position -= 1) {
    if (view.getUint32(position, true) === EOCD_SIGNATURE) {
      return {
        count: view.getUint16(position + 10, true),
        offset: view.getUint32(position + 16, true),
        position,
      }
    }
  }
  return undefined
}

function readZip64EndOfCentralDirectory(
  view: DataView,
  eocdPosition: number,
): { count: number; offset: number } | undefined {
  const locator = eocdPosition - 20
  if (locator < 0 || view.getUint32(locator, true) !== ZIP64_LOCATOR_SIGNATURE) return undefined
  const position = Number(view.getBigUint64(locator + 8, true))
  if (position + 56 > view.byteLength) return undefined
  if (view.getUint32(position, true) !== ZIP64_EOCD_SIGNATURE) return undefined
  return {
    count: Number(view.getBigUint64(position + 32, true)),
    offset: Number(view.getBigUint64(position + 48, true)),
  }
}

function resolveEntry(input: {
  readonly compressed: number
  readonly extraLength: number
  readonly extraStart: number
  readonly original: number
  readonly view: DataView
}): ZipEntrySizes {
  const { extraLength, extraStart, view } = input
  let compressedSize = input.compressed
  let originalSize = input.original
  if (compressedSize !== ZIP32_SENTINEL && originalSize !== ZIP32_SENTINEL) {
    return { compressedSize, originalSize }
  }
  const end = extraStart + extraLength
  let cursor = extraStart
  while (cursor + 4 <= end) {
    const id = view.getUint16(cursor, true)
    const size = view.getUint16(cursor + 2, true)
    if (id === ZIP64_EXTRA_ID) {
      let field = cursor + 4
      if (originalSize === ZIP32_SENTINEL && field + 8 <= end) {
        originalSize = Number(view.getBigUint64(field, true))
        field += 8
      }
      if (compressedSize === ZIP32_SENTINEL && field + 8 <= end) {
        compressedSize = Number(view.getBigUint64(field, true))
      }
      break
    }
    cursor += 4 + size
  }
  return { compressedSize, originalSize }
}

const LOCAL_SIGNATURE = 0x04034b50
const LOCAL_FIXED_BYTES = 30
const STORED = 0
const DEFLATE = 8

export type ZipDirectoryEntry = ZipEntrySizes & {
  readonly localOffset: number
  readonly method: number
  readonly name: string
}

/** O diretório central inteiro; `streamed` quando alguma entrada traz o marcador de 32 bits (zip feito em fluxo). */
export function readZipDirectory(bytes: Uint8Array): {
  readonly entries: readonly ZipDirectoryEntry[]
  readonly streamed: boolean
} {
  const entries: ZipDirectoryEntry[] = []
  let streamed = false
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const eocd = findEndOfCentralDirectory(view)
    if (eocd === undefined) return { entries: [], streamed: false }
    let { count, offset } = eocd
    if (count === 0xffff || offset === ZIP32_SENTINEL) {
      const zip64 = readZip64EndOfCentralDirectory(view, eocd.position)
      if (zip64 === undefined) return { entries: [], streamed: false }
      ;({ count, offset } = zip64)
    }
    const decoder = new TextDecoder()
    let cursor = offset
    for (let index = 0; index < count; index += 1) {
      if (cursor + CENTRAL_FIXED_BYTES > view.byteLength) return { entries: [], streamed: false }
      if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE)
        return { entries: [], streamed: false }
      const method = view.getUint16(cursor + 10, true)
      const compressed = view.getUint32(cursor + 20, true)
      const original = view.getUint32(cursor + 24, true)
      const nameLength = view.getUint16(cursor + 28, true)
      const extraLength = view.getUint16(cursor + 30, true)
      const commentLength = view.getUint16(cursor + 32, true)
      const localOffset = view.getUint32(cursor + 42, true)
      const nameStart = cursor + CENTRAL_FIXED_BYTES
      const extraStart = nameStart + nameLength
      const next = extraStart + extraLength + commentLength
      if (next > view.byteLength) return { entries: [], streamed: false }
      if (compressed === ZIP32_SENTINEL || original === ZIP32_SENTINEL) streamed = true
      entries.push({
        ...resolveEntry({ compressed, extraLength, extraStart, original, view }),
        localOffset,
        method,
        name: decoder.decode(bytes.subarray(nameStart, extraStart)),
      })
      cursor = next
    }
  } catch {
    return { entries: [], streamed: false }
  }
  return { entries, streamed }
}

/**
 * Extrai uma entrada pelo tamanho real do diretório. O buffer de saída tem exatamente `originalSize` — que quem chama
 * já conferiu contra os tetos — e o resultado precisa ter esse tamanho. Qualquer divergência lança.
 */
export function extractZipEntry(bytes: Uint8Array, entry: ZipDirectoryEntry): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const offset = entry.localOffset
  if (offset === ZIP32_SENTINEL || offset + LOCAL_FIXED_BYTES > view.byteLength) {
    throw new Error('ZIP_LOCAL_HEADER_INVALID')
  }
  if (view.getUint32(offset, true) !== LOCAL_SIGNATURE) throw new Error('ZIP_LOCAL_HEADER_INVALID')
  const start =
    offset +
    LOCAL_FIXED_BYTES +
    view.getUint16(offset + 26, true) +
    view.getUint16(offset + 28, true)
  const end = start + entry.compressedSize
  if (end > view.byteLength) throw new Error('ZIP_ENTRY_TRUNCATED')
  const data = bytes.subarray(start, end)
  const output =
    entry.method === STORED
      ? data.slice()
      : entry.method === DEFLATE
        ? inflateSync(data, { out: new Uint8Array(entry.originalSize) })
        : undefined
  if (output === undefined || output.length !== entry.originalSize) {
    throw new Error('ZIP_ENTRY_INVALID')
  }
  return output
}
