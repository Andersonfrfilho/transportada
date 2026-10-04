/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF4/T4.3 (ADR-0094 §7): a planilha de prévia vira linhas. Sem I/O: bytes, relógio e
 * tetos entram por parâmetro. Só `workbook.xml`, os relacionamentos, as strings compartilhadas e a
 * aba escolhida são descomprimidos — a macro e a aba `RESULTADO` nunca.
 */
import { resolvePreviewHeader } from './cargo-preview-header.policy.js'
import { readPreviewItems } from './cargo-preview-row.parser.js'
import { readSheetRows } from './cargo-preview-sheet.parser.js'
import {
  CARGO_PREVIEW_WORKBOOK_LIMITS,
  WORKBOOK_ENTRY,
  WORKBOOK_RELS_ENTRY,
} from './cargo-preview-workbook.constant.js'
import { CargoPreviewWorkbookError, createParseBudget } from './cargo-preview-workbook.error.js'
import type {
  CargoPreviewWorkbookLimits,
  ParseBudget,
  ParseCargoPreviewWorkbookParams,
  ParseCargoPreviewWorkbookResult,
} from './cargo-preview-workbook.types.js'
import {
  decodeXmlPart,
  readSharedStrings,
  resolveWorkbookParts,
} from './cargo-preview-xml.parser.js'
import { extractZipEntry, readZipDirectory, type ZipEntry } from './cargo-preview-zip.parser.js'

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const

type WorkbookArchive = {
  readonly budget: ParseBudget
  readonly bytes: Uint8Array
  readonly entries: ReadonlyMap<string, ZipEntry>
  readonly limits: CargoPreviewWorkbookLimits
  extractedBytes: number
}

function assertWorkbookFile(bytes: Uint8Array, limits: CargoPreviewWorkbookLimits): void {
  if (bytes.length > limits.fileBytes) throw new CargoPreviewWorkbookError('PREVIEW_FILE_TOO_LARGE')
  if (!ZIP_MAGIC.every((byte, index) => bytes[index] === byte)) {
    throw new CargoPreviewWorkbookError('PREVIEW_NOT_A_WORKBOOK')
  }
}

/** Lê uma parte XML com o teto da entrada e o total acumulado (declarado antes de inflar). */
function readPart(
  archive: WorkbookArchive,
  input: { entryName: string; maxBytes: number },
): string {
  const entry = archive.entries.get(input.entryName)
  if (entry === undefined) throw new CargoPreviewWorkbookError('PREVIEW_NOT_A_WORKBOOK')
  if (archive.extractedBytes + entry.uncompressedSize > archive.limits.totalBytes) {
    throw new CargoPreviewWorkbookError('PREVIEW_ZIP_BOMB')
  }
  const data = extractZipEntry({
    budget: archive.budget,
    bytes: archive.bytes,
    entry,
    maxBytes: input.maxBytes,
  })
  archive.extractedBytes += data.length
  archive.budget.check()
  return decodeXmlPart(data)
}

function openArchive(params: ParseCargoPreviewWorkbookParams): WorkbookArchive {
  const limits = params.limits ?? CARGO_PREVIEW_WORKBOOK_LIMITS
  const budget = createParseBudget({ budgetMs: limits.parseBudgetMs, clock: params.clock })
  assertWorkbookFile(params.bytes, limits)
  const entries = readZipDirectory({ bytes: params.bytes, maxEntries: limits.zipEntries })
  return { budget, bytes: params.bytes, entries, extractedBytes: 0, limits }
}

export function parseCargoPreviewWorkbook(
  params: ParseCargoPreviewWorkbookParams,
): ParseCargoPreviewWorkbookResult {
  const archive = openArchive(params)
  const { limits } = archive
  const metadata = { maxBytes: limits.metadataEntryBytes }
  const parts = resolveWorkbookParts({
    relsXml: readPart(archive, { ...metadata, entryName: WORKBOOK_RELS_ENTRY }),
    sheetName: params.sheetName,
    workbookXml: readPart(archive, { ...metadata, entryName: WORKBOOK_ENTRY }),
  })
  const sharedStrings =
    parts.sharedStringsEntry === undefined || !archive.entries.has(parts.sharedStringsEntry)
      ? []
      : readSharedStrings({
          maxCellLength: limits.cellTextLength,
          maxStrings: limits.sharedStrings,
          xml: readPart(archive, {
            entryName: parts.sharedStringsEntry,
            maxBytes: limits.entryBytes,
          }),
        })
  const sheetRows = readSheetRows({
    budget: archive.budget,
    lastDataRow: limits.lastDataRow,
    maxCellLength: limits.cellTextLength,
    sharedStrings,
    xml: readPart(archive, { entryName: parts.sheetEntry, maxBytes: limits.entryBytes }),
  })
  const header = resolvePreviewHeader({
    columnMap: params.columnMap,
    headerSearchRows: limits.headerSearchRows,
    rows: sheetRows,
  })
  return readPreviewItems({ header, rows: sheetRows })
}
