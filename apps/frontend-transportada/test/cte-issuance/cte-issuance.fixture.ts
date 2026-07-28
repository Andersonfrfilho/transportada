/* Copyright (c) 2026 Ada Technology. MIT License. */
export const CTE_SUBMIT = 'cte.submit'
export const CTE_CANCEL = 'cte.cancel'
export const SYNTHETIC_ACCESS_TOKEN = 'synthetic-access-token'
export const SYNTHETIC_IDEMPOTENCY_KEY = 'cte-issuance-contract-key-0001'
export const SYNTHETIC_REPROCESS_KEY = 'cte-reprocess-contract-key-0001'
export const SYNTHETIC_CANCEL_KEY = 'cte-cancel-contract-key-0001'
export const CTE_CANCEL_JUSTIFICATION = 'Prestacao de servico nao realizada pelo tomador'
export const CTE_BATCH_ID = '00000000-0000-4000-8000-000000000601'
export const CTE_BATCH_ITEM_ID = '00000000-0000-4000-8000-000000000602'
export const CTE_ATTEMPT_ID = '00000000-0000-4000-8000-000000000603'
export const CTE_DOCUMENT_ID = '00000000-0000-4000-8000-000000000604'

export type CteIssuanceStatusContract =
  | 'authorized'
  | 'cancelled'
  | 'failed'
  | 'rejected'
  | 'requested'
  | 'retry_scheduled'

export type CteIssuanceSummaryContract = Readonly<{
  accessKey?: string
  attemptId: string
  batchId: string
  batchItemId: string
  environment: 'homologation'
  protocol?: string
  reasonCause?: string
  reasonCode?: string
  status: CteIssuanceStatusContract
  updatedAt: string
}>

export type CteIssuanceRequestContract = Readonly<{
  batchId: string
  requestedAt: string
  status: 'requested'
}>

export type CteIssuanceDocumentContract = Readonly<{
  accessKey: string
  contentType: 'application/xml'
  documentId: string
  downloadUrl: string
  expiresAt: string
  sha256: string
}>

export type CteIssuanceDocumentPageContract = Readonly<{
  items: readonly CteIssuanceDocumentContract[]
  nextCursor: null | string
}>

export const CTE_ISSUE_RESPONSE = {
  batchId: CTE_BATCH_ID,
  requestedAt: '2026-07-23T12:00:00.000Z',
  status: 'requested',
} as const satisfies CteIssuanceRequestContract

export const CTE_REPROCESS_RESPONSE = {
  ...CTE_ISSUE_RESPONSE,
  requestedAt: '2026-07-23T12:10:00.000Z',
} as const satisfies CteIssuanceRequestContract

export const CTE_REJECTED_ISSUANCE = {
  accessKey: '35260761156864000191570010000000011000000010',
  attemptId: CTE_ATTEMPT_ID,
  batchId: CTE_BATCH_ID,
  batchItemId: CTE_BATCH_ITEM_ID,
  environment: 'homologation',
  protocol: '135260000000001',
  reasonCause: 'Duplicidade de CT-e',
  reasonCode: '204',
  status: 'rejected',
  updatedAt: '2026-07-23T12:05:00.000Z',
} as const satisfies CteIssuanceSummaryContract

export const CTE_AUTHORIZED_ISSUANCE = {
  accessKey: CTE_REJECTED_ISSUANCE.accessKey,
  attemptId: CTE_REJECTED_ISSUANCE.attemptId,
  batchId: CTE_REJECTED_ISSUANCE.batchId,
  batchItemId: CTE_REJECTED_ISSUANCE.batchItemId,
  environment: CTE_REJECTED_ISSUANCE.environment,
  protocol: CTE_REJECTED_ISSUANCE.protocol,
  status: 'authorized',
  updatedAt: CTE_REJECTED_ISSUANCE.updatedAt,
} as const satisfies CteIssuanceSummaryContract

export const CTE_CANCEL_RESPONSE = {
  ...CTE_ISSUE_RESPONSE,
  requestedAt: '2026-07-23T12:20:00.000Z',
} as const satisfies CteIssuanceRequestContract

export const CTE_CANCELLED_ISSUANCE = {
  ...CTE_AUTHORIZED_ISSUANCE,
  status: 'cancelled',
  updatedAt: '2026-07-23T12:25:00.000Z',
} as const satisfies CteIssuanceSummaryContract

export const CTE_RETRY_ISSUANCE = {
  attemptId: CTE_REJECTED_ISSUANCE.attemptId,
  batchId: CTE_REJECTED_ISSUANCE.batchId,
  batchItemId: CTE_REJECTED_ISSUANCE.batchItemId,
  environment: CTE_REJECTED_ISSUANCE.environment,
  reasonCause: 'Timeout ao consultar SEFAZ',
  reasonCode: 'TECHNICAL_TIMEOUT',
  status: 'retry_scheduled',
  updatedAt: CTE_REJECTED_ISSUANCE.updatedAt,
} as const satisfies CteIssuanceSummaryContract

export const CTE_DOCUMENT_PAGE = {
  items: [
    {
      accessKey: '35260761156864000191570010000000011000000010',
      contentType: 'application/xml',
      documentId: CTE_DOCUMENT_ID,
      downloadUrl: 'https://storage.test/temporary/cte-document.xml?signature=redacted',
      expiresAt: '2026-07-23T12:15:00.000Z',
      sha256: '0'.repeat(64),
    },
  ],
  nextCursor: null,
} as const satisfies CteIssuanceDocumentPageContract

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
