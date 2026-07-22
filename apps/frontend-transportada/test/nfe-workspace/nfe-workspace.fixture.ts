/* Copyright (c) 2026 Ada Technology. MIT License. */
export const INVOICES_IMPORT = 'invoices.import'
export const INVOICES_READ = 'invoices.read'
export const SYNTHETIC_ACCESS_TOKEN = 'synthetic-access-token'
export const SYNTHETIC_CURSOR =
  'WyIyMDI2LTA3LTIyVDEyOjAwOjAwLjAwMFoiLCIwMThmNmE0NS0yZDlkLTdlNjAtYmI0Mi01YjFhNGM0ZDNlOTEiXQ'
export const SYNTHETIC_IDEMPOTENCY_KEY = 'nfe-workspace-contract-key-0001'

export type NfeImportSummaryContract = Readonly<{
  correlationId: string
  createdAt: string
  duplicatedCount: number
  failedCount: number
  id: string
  idempotencyKey: string
  importedCount: number
  invalidCount: number
  processedCount: number
  receivedCount: number
  rejectedCount: number
  source: 'distribution' | 'upload'
  status:
    | 'cancelled'
    | 'completed'
    | 'failed'
    | 'partially_processed'
    | 'pending'
    | 'processing'
    | 'queued'
  terminalError: null | Readonly<{
    code: string
    message: string
  }>
  updatedAt: string
  version: string
}>

export type NfeImportListPageContract = Readonly<{
  items: readonly NfeImportSummaryContract[]
  nextCursor: null | string
}>

export type NfeDocumentListItemContract = Readonly<{
  accessKey: string
  emitterName: string
  id: string
  issuedAt: string
  recipientName: string
  status: 'authorized' | 'cancelled' | 'denied'
  totalAmount: string
  variant: 'complete' | 'event' | 'summary'
}>

export type NfeDocumentListPageContract = Readonly<{
  items: readonly NfeDocumentListItemContract[]
  nextCursor: null | string
}>

export const IMPORT_SUMMARY = {
  correlationId: 'corr-nfe-001',
  createdAt: '2026-07-22T12:00:00.000Z',
  duplicatedCount: 0,
  failedCount: 0,
  id: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e91',
  idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
  importedCount: 0,
  invalidCount: 0,
  processedCount: 0,
  receivedCount: 2,
  rejectedCount: 0,
  source: 'upload',
  status: 'queued',
  terminalError: null,
  updatedAt: '2026-07-22T12:00:00.000Z',
  version: '1',
} as const satisfies NfeImportSummaryContract

export const API_IMPORT_SUMMARY = {
  correlationId: IMPORT_SUMMARY.correlationId,
  counters: {
    duplicated: String(IMPORT_SUMMARY.duplicatedCount),
    failed: String(IMPORT_SUMMARY.failedCount),
    imported: String(IMPORT_SUMMARY.importedCount),
    invalid: String(IMPORT_SUMMARY.invalidCount),
    processed: String(IMPORT_SUMMARY.processedCount),
    received: String(IMPORT_SUMMARY.receivedCount),
    rejected: String(IMPORT_SUMMARY.rejectedCount),
  },
  createdAt: IMPORT_SUMMARY.createdAt,
  id: IMPORT_SUMMARY.id,
  idempotencyKey: IMPORT_SUMMARY.idempotencyKey,
  source: IMPORT_SUMMARY.source,
  status: IMPORT_SUMMARY.status,
  terminalError: IMPORT_SUMMARY.terminalError,
  updatedAt: IMPORT_SUMMARY.updatedAt,
  version: IMPORT_SUMMARY.version,
} as const

export const RUNNING_IMPORT = {
  ...IMPORT_SUMMARY,
  processedCount: 1,
  status: 'processing',
} as const satisfies NfeImportSummaryContract

export const TERMINAL_IMPORT = {
  ...IMPORT_SUMMARY,
  importedCount: 1,
  processedCount: 2,
  status: 'partially_processed',
} as const satisfies NfeImportSummaryContract

export const IMPORT_LIST_PAGE = {
  items: [IMPORT_SUMMARY],
  nextCursor: SYNTHETIC_CURSOR,
} as const satisfies NfeImportListPageContract

export const DOCUMENT_LIST_PAGE = {
  items: [
    {
      accessKey: '35190730290856000160550010000000011000000010',
      emitterName: 'Emitente Transportada',
      id: '4c596f2c-388e-4820-8e49-0fa5916f5cb0',
      issuedAt: '2026-07-22T10:00:00.000Z',
      recipientName: 'Destinatario Cliente',
      status: 'authorized',
      totalAmount: '1234.5600',
      variant: 'complete',
    },
  ],
  nextCursor: null,
} as const satisfies NfeDocumentListPageContract

export function syntheticXmlFile(): File {
  return new File(['<nfeProc versao="4.00"></nfeProc>'], 'valid-nfe.xml', {
    type: 'application/xml',
  })
}

export function syntheticZipFile(): File {
  return new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'batch.zip', {
    type: 'application/zip',
  })
}

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
