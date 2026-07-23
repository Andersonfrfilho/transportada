/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  FAILED_IMPORT,
  IMPORT_ID,
  IMPORT_ITEM,
  QUEUED_IMPORT,
  SECOND_IMPORT_ITEM,
} from './nfe-import-application.fixture'
import type { NfeDocumentDetail, NfeDocumentSummary } from './nfe-http.types'
import type {
  NfeImportDetail,
  NfeImportItem,
  NfeImportSummary,
} from '../../src/nfe-imports/application/nfe-import.types'

export const DOCUMENT_ID = '00000000-0000-4000-8000-000000000230'
export const OTHER_DOCUMENT_ID = '00000000-0000-4000-8000-000000000231'
export const DOCUMENT_ACCESS_KEY = '35260761156864000191550010000000022000000022'
export const DOCUMENT_XML = new TextEncoder().encode(
  '<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00"></nfeProc>',
)

export const IMPORT_DETAIL: NfeImportDetail = {
  ...FAILED_IMPORT,
  items: [IMPORT_ITEM, SECOND_IMPORT_ITEM] as readonly NfeImportItem[],
}

export const UPLOAD_RESPONSE = QUEUED_IMPORT
export const DISTRIBUTION_RESPONSE: NfeImportSummary = {
  ...QUEUED_IMPORT,
  id: '00000000-0000-4000-8000-000000000240',
  idempotencyKey: 'nfe-distribution-0001',
  source: 'distribution',
}

export const REPROCESS_RESPONSE: NfeImportSummary = {
  ...FAILED_IMPORT,
  id: IMPORT_ID,
  status: 'queued',
  terminalError: null,
  version: 3n,
}

export const DOCUMENT_SUMMARY: NfeDocumentSummary = {
  accessKey: DOCUMENT_ACCESS_KEY,
  emitterName: 'Emitente Teste LTDA',
  id: DOCUMENT_ID,
  issuedAt: '2026-07-22T14:00:00.000Z',
  recipientName: 'TransportAdA LTDA',
  status: 'authorized',
  totalAmount: '1250.4500',
  variant: 'complete',
}

export const DOCUMENT_DETAIL: NfeDocumentDetail = DOCUMENT_SUMMARY
export const DOCUMENT_ELIGIBILITY = {
  authorizedDocument: true,
  companyRelated: true,
  decision: 'PENDING_FREIGHT_AND_CTE_RULES',
  hasOriginalXml: true,
} as const

export function serializeImportSummary(summary: NfeImportSummary): object {
  return {
    correlationId: summary.correlationId,
    counters: {
      duplicated: summary.duplicatedCount.toString(),
      failed: summary.failedCount.toString(),
      imported: summary.importedCount.toString(),
      invalid: summary.invalidCount.toString(),
      processed: summary.processedCount.toString(),
      received: summary.receivedCount.toString(),
      rejected: summary.rejectedCount.toString(),
    },
    createdAt: summary.createdAt,
    id: summary.id,
    idempotencyKey: summary.idempotencyKey,
    source: summary.source,
    status: summary.status,
    terminalError: summary.terminalError,
    updatedAt: summary.updatedAt,
    version: summary.version.toString(),
  }
}

export function serializeImportDetail(detail: NfeImportDetail): object {
  return {
    ...serializeImportSummary(detail),
    items: detail.items.map(serializeImportItem),
  }
}

export function serializeDocumentSummary(document: NfeDocumentSummary): object {
  return {
    accessKey: document.accessKey,
    emitterName: document.emitterName,
    id: document.id,
    issuedAt: document.issuedAt,
    recipientName: document.recipientName,
    status: document.status,
    totalAmount: document.totalAmount,
    variant: document.variant,
  }
}

function serializeImportItem(item: NfeImportItem): object {
  return {
    accessKey: item.accessKey ?? null,
    attempt: item.attempt.toString(),
    environment: item.environment ?? null,
    error: item.error,
    id: item.id,
    ordinal: item.ordinal.toString(),
    previousAttempt: item.previousAttempt === null ? null : item.previousAttempt.toString(),
    previousItemId: item.previousItemId,
    sourceEntry: item.sourceEntry,
    sourceName: item.sourceName,
    sourceNsu: item.sourceNsu ?? null,
    status: item.status,
    variant: item.variant ?? null,
  }
}
