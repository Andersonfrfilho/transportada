/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { crc32, deflateRawSync } from 'node:zlib'

/**
 * Escritor de ZIP mínimo para a fixture da planilha. Existe porque a alternativa era versionar um
 * `.xlsx` binário de 298 KB: opaco no diff, impossível de ajustar numa revisão. Aqui as entradas
 * saem comprimidas de verdade (deflate cru), que é o que o leitor do T013 tem de saber abrir.
 */

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const DEFLATE_METHOD = 8
const DOS_EPOCH_DATE = 0x0021
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const ZIP_VERSION = 20

export type ZipEntry = {
  readonly content: string
  readonly name: string
}

type PreparedEntry = {
  readonly checksum: number
  readonly compressedSize: number
  readonly name: Buffer
  readonly offset: number
  readonly uncompressedSize: number
}

function buildLocalEntry(input: { readonly entry: ZipEntry; readonly offset: number }): {
  readonly parts: readonly Buffer[]
  readonly prepared: PreparedEntry
} {
  const raw = Buffer.from(input.entry.content, 'utf8')
  const compressed = deflateRawSync(raw)
  const name = Buffer.from(input.entry.name, 'utf8')
  const checksum = crc32(raw)
  const header = Buffer.alloc(30 + name.length)

  header.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0)
  header.writeUInt16LE(ZIP_VERSION, 4)
  header.writeUInt16LE(DEFLATE_METHOD, 8)
  header.writeUInt16LE(DOS_EPOCH_DATE, 12)
  header.writeUInt32LE(checksum, 14)
  header.writeUInt32LE(compressed.length, 18)
  header.writeUInt32LE(raw.length, 22)
  header.writeUInt16LE(name.length, 26)
  name.copy(header, 30)

  return {
    parts: [header, compressed],
    prepared: {
      checksum,
      compressedSize: compressed.length,
      name,
      offset: input.offset,
      uncompressedSize: raw.length,
    },
  }
}

function buildCentralEntry(prepared: PreparedEntry): Buffer {
  const header = Buffer.alloc(46 + prepared.name.length)

  header.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0)
  header.writeUInt16LE(ZIP_VERSION, 4)
  header.writeUInt16LE(ZIP_VERSION, 6)
  header.writeUInt16LE(DEFLATE_METHOD, 10)
  header.writeUInt16LE(DOS_EPOCH_DATE, 14)
  header.writeUInt32LE(prepared.checksum, 16)
  header.writeUInt32LE(prepared.compressedSize, 20)
  header.writeUInt32LE(prepared.uncompressedSize, 24)
  header.writeUInt16LE(prepared.name.length, 28)
  header.writeUInt32LE(prepared.offset, 42)
  prepared.name.copy(header, 46)

  return header
}

function buildEndOfCentralDirectory(input: {
  readonly entryCount: number
  readonly size: number
  readonly offset: number
}): Buffer {
  const record = Buffer.alloc(22)

  record.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0)
  record.writeUInt16LE(input.entryCount, 8)
  record.writeUInt16LE(input.entryCount, 10)
  record.writeUInt32LE(input.size, 12)
  record.writeUInt32LE(input.offset, 16)

  return record
}

export function buildZipArchive(input: { readonly entries: readonly ZipEntry[] }): Uint8Array {
  const bodyParts: Buffer[] = []
  const preparedEntries: PreparedEntry[] = []
  let offset = 0

  for (const entry of input.entries) {
    const { parts, prepared } = buildLocalEntry({ entry, offset })
    bodyParts.push(...parts)
    preparedEntries.push(prepared)
    offset += parts.reduce((total, part) => total + part.length, 0)
  }

  const centralParts = preparedEntries.map(buildCentralEntry)
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0)
  const endRecord = buildEndOfCentralDirectory({
    entryCount: preparedEntries.length,
    offset,
    size: centralSize,
  })

  return new Uint8Array(Buffer.concat([...bodyParts, ...centralParts, endRecord]))
}
