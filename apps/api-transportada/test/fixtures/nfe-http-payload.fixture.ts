/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ScheduledDistributionStatus } from '../../src/companies/application/get-scheduled-distribution-status.use-case'
import {
  COMPANY_ID,
  FAILED_IMPORT,
  IMPORT_ID,
  IMPORT_ITEM,
  QUEUED_IMPORT,
  SECOND_IMPORT_ITEM,
} from './nfe-import-application.fixture'
import type { NfeDocumentDetail, NfeDocumentSummary } from './nfe-http.types'
import type {
  NfeDistributionStatus,
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

export const DISTRIBUTION_STATUS: NfeDistributionStatus = {
  canPull: true,
  environment: 'homologation',
  lastPulledAt: '2026-07-22T13:40:00.000Z',
  maxNsu: '000000000000120',
  nextAllowedAt: null,
  pullInProgress: false,
  ultNsu: '000000000000120',
}

export const SCHEDULED_DISTRIBUTION_STATUS: ScheduledDistributionStatus = {
  certificateExpiresAt: '2027-01-31T23:59:59.000Z',
  companyId: COMPANY_ID,
  eligible: true,
  enabled: true,
  ineligibilityReason: undefined,
  lastAutomationImport: {
    finishedAt: '2026-07-22T13:41:00.000Z',
    receivedCount: 12,
    startedAt: '2026-07-22T13:40:00.000Z',
    status: 'completed',
  },
  nextAllowedAt: undefined,
  nextScheduledRunAt: '2026-07-22T14:00:00.000Z',
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
  cteBlockReason: null,
  nfseBlockReason: null,
  tripId: null,
  tripStatus: null,
  emitterAddress: 'Rua das Cargas, 100 - Centro',
  emitterCity: 'Campinas',
  emitterCityCode: '3509502',
  emitterName: 'Emitente Teste LTDA',
  emitterState: 'SP',
  emitterTaxId: '61156864000191',
  id: DOCUMENT_ID,
  issuedAt: '2026-07-22T14:00:00.000Z',
  nfseInvoiceId: null,
  nfseInvoiceNumber: null,
  number: '000012345',
  recipientAddress: 'Avenida Logística, 500 - Distrito Industrial',
  recipientCity: 'Jundiaí',
  recipientCityCode: '3525904',
  recipientName: 'TransportAdA LTDA',
  recipientState: 'SP',
  recipientTaxId: '12345678000199',
  series: '001',
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
    cteBlockReason: document.cteBlockReason,
    nfseBlockReason: document.nfseBlockReason,
    emitterAddress: document.emitterAddress,
    emitterCity: document.emitterCity,
    emitterCityCode: document.emitterCityCode,
    emitterName: document.emitterName,
    emitterState: document.emitterState,
    emitterTaxId: document.emitterTaxId,
    id: document.id,
    issuedAt: document.issuedAt,
    nfseInvoiceId: document.nfseInvoiceId,
    nfseInvoiceNumber: document.nfseInvoiceNumber,
    number: document.number,
    recipientAddress: document.recipientAddress,
    recipientCity: document.recipientCity,
    recipientCityCode: document.recipientCityCode,
    recipientName: document.recipientName,
    recipientState: document.recipientState,
    recipientTaxId: document.recipientTaxId,
    series: document.series,
    status: document.status,
    totalAmount: document.totalAmount,
    tripId: document.tripId,
    tripStatus: document.tripStatus,
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
