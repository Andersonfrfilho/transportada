/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { type UnzipFileInfo, unzipSync } from 'fflate'

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
  maxEntryBytes: 5 * 1024 * 1024,
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
      return expandZip(input.sourceBytes, limits)
    },
  }
}

function expandZip(
  sourceBytes: Uint8Array,
  limits: ArchiveExpanderLimits,
): readonly ExpandedXmlEntry[] {
  const unzipped = readArchive(sourceBytes, limits)

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
): Record<string, Uint8Array> {
  let acceptedEntries = 0
  let acceptedBytes = 0

  try {
    return unzipSync(sourceBytes, {
      filter(file: UnzipFileInfo): boolean {
        if (isDirectory(file.name) || !isXmlEntry(file.name)) {
          return false
        }
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
