/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.1 (ADR-0094 §7): os tetos da leitura da planilha de prévia, medidos contra as quatro
 * planilhas FR (a maior aba descomprimida tem 3,39 MB; a última linha com dado, 220; a linha mais
 * larga, 14 células). A revisão de segurança (S1/S4) baixou bytes e linhas e pôs teto de células: o
 * custo do parse cresce com elas, e 87 KiB comprimidos chegavam a 760 mil células numa linha.
 */

const MEBIBYTE = 1024 * 1024

export const CARGO_PREVIEW_WORKBOOK_LIMITS = {
  cellTextLength: 32_767,
  entryBytes: 8 * MEBIBYTE,
  fileBytes: 5 * MEBIBYTE,
  headerSearchRows: 20,
  lastDataRow: 5_000,
  metadataEntryBytes: MEBIBYTE,
  parseBudgetMs: 5_000,
  rowCells: 512,
  sharedStrings: 200_000,
  totalBytes: 16 * MEBIBYTE,
  totalCells: 120_000,
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
  'PREVIEW_TOO_MANY_CELLS',
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
  PREVIEW_TOO_MANY_CELLS: 'The preview has more cells than allowed',
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

/**
 * Os campos decimais do item com a escala e os dígitos inteiros da coluna (`value numeric(14,2)`,
 * `weight_kg numeric(12,3)`, `volume_m3 numeric(12,4)`): passou, é erro da linha, nunca do banco.
 */
export const PREVIEW_DECIMAL_FIELDS = {
  value: { maxIntegerDigits: 12, scale: 2 },
  volumeM3: { maxIntegerDigits: 8, scale: 4 },
  weightKg: { maxIntegerDigits: 9, scale: 3 },
} as const

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
