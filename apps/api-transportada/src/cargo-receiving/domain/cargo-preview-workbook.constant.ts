/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.1 (ADR-0094 §7): os tetos da leitura da planilha de prévia, medidos contra as quatro
 * planilhas FR (a maior aba descomprimida tem 3,39 MB; a última linha com dado, 220).
 */

const MEBIBYTE = 1024 * 1024

export const CARGO_PREVIEW_WORKBOOK_LIMITS = {
  cellTextLength: 32_767,
  entryBytes: 30 * MEBIBYTE,
  fileBytes: 5 * MEBIBYTE,
  headerSearchRows: 20,
  lastDataRow: 20_000,
  metadataEntryBytes: MEBIBYTE,
  parseBudgetMs: 5_000,
  sharedStrings: 200_000,
  totalBytes: 60 * MEBIBYTE,
  zipEntries: 100,
} as const

/** Fatia do fluxo comprimido por passo: a razão máxima do deflate (~1032:1) limita o excesso a ~4 MiB. */
export const INFLATE_SLICE_BYTES = 4 * 1024

export const CARGO_PREVIEW_ERROR_CODES = [
  'PREVIEW_CELL_TOO_LONG',
  'PREVIEW_COLUMN_DUPLICATED',
  'PREVIEW_COLUMN_NOT_FOUND',
  'PREVIEW_FILE_TOO_LARGE',
  'PREVIEW_NOT_A_WORKBOOK',
  'PREVIEW_PARSE_TIMEOUT',
  'PREVIEW_SHEET_NOT_FOUND',
  'PREVIEW_TOO_MANY_ENTRIES',
  'PREVIEW_TOO_MANY_ROWS',
  'PREVIEW_TOO_MANY_STRINGS',
  'PREVIEW_ZIP_BOMB',
  'PREVIEW_ZIP_ENTRY_UNSAFE',
] as const
export type CargoPreviewErrorCode = (typeof CARGO_PREVIEW_ERROR_CODES)[number]

export const CARGO_PREVIEW_ERROR_MESSAGES: Readonly<Record<CargoPreviewErrorCode, string>> = {
  PREVIEW_CELL_TOO_LONG: 'A cell of the preview is longer than allowed',
  PREVIEW_COLUMN_DUPLICATED: 'A mapped column appears more than once in the preview header',
  PREVIEW_COLUMN_NOT_FOUND: 'Mapped columns were not found in the preview header',
  PREVIEW_FILE_TOO_LARGE: 'The preview file is larger than allowed',
  PREVIEW_NOT_A_WORKBOOK: 'The preview file is not a readable workbook',
  PREVIEW_PARSE_TIMEOUT: 'Reading the preview took longer than allowed',
  PREVIEW_SHEET_NOT_FOUND: 'The preview sheet was not found',
  PREVIEW_TOO_MANY_ENTRIES: 'The preview file has too many entries',
  PREVIEW_TOO_MANY_ROWS: 'The preview has rows beyond the allowed limit',
  PREVIEW_TOO_MANY_STRINGS: 'The preview has too many shared strings',
  PREVIEW_ZIP_BOMB: 'The preview file expands beyond the allowed size',
  PREVIEW_ZIP_ENTRY_UNSAFE: 'The preview file has an unsafe entry path',
}

export const WORKBOOK_ENTRY = 'xl/workbook.xml'
export const WORKBOOK_RELS_ENTRY = 'xl/_rels/workbook.xml.rels'
export const WORKBOOK_BASE_PATH = 'xl/'
export const SHARED_STRINGS_RELATIONSHIP_SUFFIX = '/sharedStrings'
export const WORKSHEET_RELATIONSHIP_SUFFIX = '/worksheet'

/** Os limites de texto por campo, depois de aparado. */
export const PREVIEW_TEXT_FIELD_MAX_LENGTH = {
  address: 255,
  city: 120,
  contractorReference: 40,
  neighborhood: 120,
  recipientCode: 40,
  recipientName: 200,
  routeName: 60,
} as const
