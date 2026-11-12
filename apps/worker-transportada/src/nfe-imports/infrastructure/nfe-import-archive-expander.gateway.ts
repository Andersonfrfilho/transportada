/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { type UnzipFileInfo, unzipSync } from 'fflate'

import {
  extractZipEntry,
  readZipDirectory,
  type ZipDirectoryEntry,
} from './zip-entry-sizes.reader.js'

const XML_EXTENSION = '.xml'
const DEFLATE_COMPRESSION = 8

const ARCHIVE_ERROR_CODE = {
  EMPTY_ENTRY: 'ZIP_EMPTY_ENTRY',
  ENTRY_TOO_LARGE: 'ZIP_ENTRY_TOO_LARGE',
  EXPANSION_LIMIT: 'ZIP_EXPANSION_LIMIT',
  INVALID_ARCHIVE: 'ZIP_INVALID_ARCHIVE',
  NO_XML_ENTRIES: 'ZIP_NO_XML_ENTRIES',
  PATH_TRAVERSAL: 'ZIP_PATH_TRAVERSAL',
} as const

type ArchiveErrorCode = (typeof ARCHIVE_ERROR_CODE)[keyof typeof ARCHIVE_ERROR_CODE]

type ArchiveExpanderLimits = {
  readonly maxCompressionRatio: number
  readonly maxEntries: number
  readonly maxEntryBytes: number
  readonly maxTotalBytes: number
}

const DEFAULT_LIMITS: ArchiveExpanderLimits = {
  maxCompressionRatio: 20,
  maxEntries: 500,
  maxEntryBytes: 25 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
}

type ExpandedXmlEntry = {
  readonly entryName: string
  readonly sourceBytes: Uint8Array
  readonly sourceSha256: string
}

type NfeImportArchiveExpander = {
  expand(input: {
    readonly contentType: 'application/xml' | 'application/zip'
    readonly sourceBytes: Uint8Array
    readonly sourceEntry: string
    readonly sourceName: string
  }): Promise<readonly ExpandedXmlEntry[]>
}

export class ArchiveExpansionError extends Error {
  public readonly code: ArchiveErrorCode

  constructor(code: ArchiveErrorCode) {
    super(code)
    this.name = 'ArchiveExpansionError'
    this.code = code
  }
}

export function createNfeImportArchiveExpander(
  options: { readonly limits?: Partial<ArchiveExpanderLimits> } = {},
): NfeImportArchiveExpander {
  const limits: ArchiveExpanderLimits = { ...DEFAULT_LIMITS, ...options.limits }

  return {
    async expand(input): Promise<readonly ExpandedXmlEntry[]> {
      if (input.contentType === 'application/xml') {
        return [toEntry(input.sourceEntry, input.sourceBytes)]
      }
      return expandZip(input.sourceBytes, limits, singleEntryName(input.sourceEntry))
    },
  }
}

/**
 * Spec 306: o recebimento (e-mail/WhatsApp) cria um item por XML do zip, com o nome da entrada em `sourceEntry`. Item
 * com o prefixo `entry:` (`ZIP_ENTRY_SOURCE_PREFIX`) lê só aquela entrada; o legado (`/`, o nome do zip) segue lendo o zip
 * inteiro.
 */
export const ZIP_ENTRY_SOURCE_PREFIX = 'entry:'

function singleEntryName(sourceEntry: string): string | undefined {
  return sourceEntry.startsWith(ZIP_ENTRY_SOURCE_PREFIX)
    ? sourceEntry.slice(ZIP_ENTRY_SOURCE_PREFIX.length)
    : undefined
}

function expandZip(
  sourceBytes: Uint8Array,
  limits: ArchiveExpanderLimits,
  only?: string,
): readonly ExpandedXmlEntry[] {
  const unzipped = readArchive(sourceBytes, limits, only)

  const names = Object.keys(unzipped).sort()
  const entries: ExpandedXmlEntry[] = []
  for (const name of names) {
    const bytes = unzipped[name]
    if (bytes === undefined || bytes.byteLength === 0) {
      throw new ArchiveExpansionError(ARCHIVE_ERROR_CODE.EMPTY_ENTRY)
    }
    entries.push(toEntry(name, bytes))
  }

  if (entries.length === 0) {
    throw new ArchiveExpansionError(ARCHIVE_ERROR_CODE.NO_XML_ENTRIES)
  }
  return entries
}

function readArchive(
  sourceBytes: Uint8Array,
  limits: ArchiveExpanderLimits,
  only?: string,
): Record<string, Uint8Array> {
  const directory = readZipDirectory(sourceBytes)
  if (directory.streamed) {
    const wanted =
      only === undefined ? directory.entries : directory.entries.filter((e) => e.name === only)
    return readStreamedArchive(sourceBytes, wanted, limits)
  }

  let acceptedEntries = 0
  let acceptedBytes = 0

  try {
    return unzipSync(sourceBytes, {
      filter(file: UnzipFileInfo): boolean {
        if (isDirectory(file.name) || !isXmlEntry(file.name)) {
          return false
        }
        if (only !== undefined && file.name !== only) return false
        assertSafeEntryName(file.name)
        assertWithinEntryLimit(file, limits)

        acceptedEntries += 1
        if (acceptedEntries > limits.maxEntries) {
          throw new ArchiveExpansionError(ARCHIVE_ERROR_CODE.EXPANSION_LIMIT)
        }
        acceptedBytes += file.originalSize
        if (acceptedBytes > limits.maxTotalBytes) {
          throw new ArchiveExpansionError(ARCHIVE_ERROR_CODE.EXPANSION_LIMIT)
        }
        return true
      },
    })
  } catch (error: unknown) {
    if (error instanceof ArchiveExpansionError) {
      throw error
    }
    throw new ArchiveExpansionError(ARCHIVE_ERROR_CODE.INVALID_ARCHIVE)
  }
}

/**
 * Spec 305: zip feito em fluxo (marcador `0xFFFFFFFF` no diretório). O `unzipSync` alocaria 4 GiB por entrada, então a
 * extração é nossa, com os mesmos tetos aplicados ao tamanho real, **antes** de qualquer buffer ser alocado.
 */
function readStreamedArchive(
  sourceBytes: Uint8Array,
  directory: readonly ZipDirectoryEntry[],
  limits: ArchiveExpanderLimits,
): Record<string, Uint8Array> {
  const selected: ZipDirectoryEntry[] = []
  let acceptedBytes = 0
  for (const entry of directory) {
    if (isDirectory(entry.name) || !isXmlEntry(entry.name)) continue
    assertSafeEntryName(entry.name)
    assertWithinEntryLimit(
      {
        compression: entry.method,
        name: entry.name,
        originalSize: entry.originalSize,
        size: entry.compressedSize,
      },
      limits,
    )
    if (selected.length + 1 > limits.maxEntries) {
      throw new ArchiveExpansionError(ARCHIVE_ERROR_CODE.EXPANSION_LIMIT)
    }
    acceptedBytes += entry.originalSize
    if (acceptedBytes > limits.maxTotalBytes) {
      throw new ArchiveExpansionError(ARCHIVE_ERROR_CODE.EXPANSION_LIMIT)
    }
    selected.push(entry)
  }
  try {
    const extracted: Record<string, Uint8Array> = {}
    for (const entry of selected) extracted[entry.name] = extractZipEntry(sourceBytes, entry)
    return extracted
  } catch {
    throw new ArchiveExpansionError(ARCHIVE_ERROR_CODE.INVALID_ARCHIVE)
  }
}

function assertWithinEntryLimit(file: UnzipFileInfo, limits: ArchiveExpanderLimits): void {
  if (file.originalSize > limits.maxEntryBytes) {
    throw new ArchiveExpansionError(ARCHIVE_ERROR_CODE.ENTRY_TOO_LARGE)
  }
  if (file.compression === DEFLATE_COMPRESSION && file.size > 0) {
    if (file.originalSize / file.size > limits.maxCompressionRatio) {
      throw new ArchiveExpansionError(ARCHIVE_ERROR_CODE.EXPANSION_LIMIT)
    }
  }
}

function assertSafeEntryName(name: string): void {
  const isUnsafe =
    name.startsWith('/') ||
    name.includes('\\') ||
    name.includes('\0') ||
    name.split('/').some((segment) => segment === '..') ||
    /^[a-zA-Z]:/.test(name)
  if (isUnsafe) {
    throw new ArchiveExpansionError(ARCHIVE_ERROR_CODE.PATH_TRAVERSAL)
  }
}

function isDirectory(name: string): boolean {
  return name.endsWith('/')
}

function isXmlEntry(name: string): boolean {
  return name.toLowerCase().endsWith(XML_EXTENSION)
}

function toEntry(entryName: string, sourceBytes: Uint8Array): ExpandedXmlEntry {
  return {
    entryName,
    sourceBytes,
    sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
  }
}
