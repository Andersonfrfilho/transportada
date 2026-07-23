/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../src/identity/domain/tenant-context'

export type NfeImportStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'partially_processed'
  | 'failed'
  | 'cancelled'

export type NfeItemStatus =
  | 'pending'
  | 'validating'
  | 'imported'
  | 'duplicated'
  | 'invalid'
  | 'rejected'
  | 'failed'

export type NfeItemVariant = 'complete' | 'summary' | 'event'

export type NfeImportSafeError = {
  readonly code: string
  readonly message: string
}

export type NfeImportSourceDescriptor = {
  readonly contentLength: number
  readonly contentType: string
  readonly objectId: string
  readonly sha256: string
  readonly sourceEntry: string
  readonly sourceName: string
}

export type NfeImportItemAttempt = {
  readonly accessKey?: string
  readonly attempt: bigint
  readonly companyId: string
  readonly environment?: 'homologation' | 'production'
  readonly error: NfeImportSafeError | null
  readonly id: string
  readonly importId: string
  readonly ordinal: bigint
  readonly previousAttempt: bigint | null
  readonly previousItemId: string | null
  readonly sourceEntry: string
  readonly sourceName: string
  readonly sourceNsu?: string
  readonly sourceObjectId: string
  readonly sourceSha256: string
  readonly status: NfeItemStatus
  readonly variant?: NfeItemVariant
}

export type NfeImportSummary = {
  readonly companyId: string
  readonly correlationId: string
  readonly createdAt: string
  readonly duplicatedCount: bigint
  readonly failedCount: bigint
  readonly id: string
  readonly idempotencyKey: string
  readonly importedCount: bigint
  readonly invalidCount: bigint
  readonly processedCount: bigint
  readonly receivedCount: bigint
  readonly rejectedCount: bigint
  readonly requestedByUserId: string
  readonly source: 'distribution' | 'upload'
  readonly status: NfeImportStatus
  readonly terminalError: NfeImportSafeError | null
  readonly updatedAt: string
  readonly version: bigint
}

export type NfeImportDetail = NfeImportSummary & {
  readonly items: readonly NfeImportItemAttempt[]
}

export type NfeImportListPage = {
  readonly items: readonly NfeImportSummary[]
  readonly nextCursor: string | null
}

export const COMPANY_ID = '00000000-0000-4000-8000-000000000201'
export const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000202'
export const USER_ID = '00000000-0000-4000-8000-000000000203'
export const OTHER_USER_ID = '00000000-0000-4000-8000-000000000204'
export const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000205'
export const CORRELATION_ID = '00000000-0000-4000-8000-000000000206'
export const IDEMPOTENCY_KEY = 'nfe-import-upload-0001'
export const IMPORT_ID = '00000000-0000-4000-8000-000000000207'
export const OTHER_IMPORT_ID = '00000000-0000-4000-8000-000000000208'
export const ITEM_ID = '00000000-0000-4000-8000-000000000209'
export const RETRY_ITEM_ID = '00000000-0000-4000-8000-00000000020a'
export const SECOND_ITEM_ID = '00000000-0000-4000-8000-00000000020b'
export const OBJECT_ID = '00000000-0000-4000-8000-00000000020c'
export const SECOND_OBJECT_ID = '00000000-0000-4000-8000-00000000020d'
export const EVENT_ID = '00000000-0000-4000-8000-00000000020e'
export const REQUEST_FINGERPRINT = 'nfe-import-request-fingerprint'
export const OTHER_REQUEST_FINGERPRINT = 'nfe-import-request-fingerprint-other'
export const SAFE_CONFLICT_SENTINEL = 'sensitive-cross-tenant-diagnostic'
export const NOW = '2026-07-22T13:40:00.000Z'
export const ACCESS_KEY = '35260761156864000191550010000000011000000011'

export const COMPANY_CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: MEMBERSHIP_ID,
  permissions: new Set(['invoices.import', 'invoices.read']),
  roles: ['company-admin'],
  userId: USER_ID,
}

export const READ_ONLY_CONTEXT: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['invoices.read']),
}

export const OTHER_COMPANY_CONTEXT: CompanyContext = {
  companyId: OTHER_COMPANY_ID,
  kind: 'company',
  membershipId: '00000000-0000-4000-8000-00000000020f',
  permissions: new Set(['invoices.import', 'invoices.read']),
  roles: ['company-admin'],
  userId: OTHER_USER_ID,
}

export const UPLOAD_SOURCES = [
  {
    contentLength: 512,
    contentType: 'application/xml',
    objectId: OBJECT_ID,
    sha256: '1111111111111111111111111111111111111111111111111111111111111111',
    sourceEntry: '/',
    sourceName: 'first.xml',
  },
  {
    contentLength: 1024,
    contentType: 'application/zip',
    objectId: SECOND_OBJECT_ID,
    sha256: '2222222222222222222222222222222222222222222222222222222222222222',
    sourceEntry: 'batch/second.xml',
    sourceName: 'batch.zip',
  },
] as const satisfies readonly NfeImportSourceDescriptor[]

export const QUEUED_IMPORT = {
  companyId: COMPANY_ID,
  correlationId: CORRELATION_ID,
  createdAt: NOW,
  duplicatedCount: 0n,
  failedCount: 0n,
  id: IMPORT_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  importedCount: 0n,
  invalidCount: 0n,
  processedCount: 0n,
  receivedCount: 2n,
  rejectedCount: 0n,
  requestedByUserId: USER_ID,
  source: 'upload',
  status: 'queued',
  terminalError: null,
  updatedAt: NOW,
  version: 1n,
} as const satisfies NfeImportSummary

export const FAILED_IMPORT = {
  ...QUEUED_IMPORT,
  failedCount: 1n,
  processedCount: 1n,
  status: 'failed',
  terminalError: { code: 'NFE_IMPORT_FAILED', message: 'NF-e import failed' },
  version: 2n,
} as const satisfies NfeImportSummary

export const IMPORT_ITEM = {
  accessKey: ACCESS_KEY,
  attempt: 1n,
  companyId: COMPANY_ID,
  error: null,
  id: ITEM_ID,
  importId: IMPORT_ID,
  ordinal: 1n,
  previousAttempt: null,
  previousItemId: null,
  sourceEntry: '/',
  sourceName: 'first.xml',
  sourceObjectId: OBJECT_ID,
  sourceSha256: '1111111111111111111111111111111111111111111111111111111111111111',
  status: 'failed',
  variant: 'complete',
} as const satisfies NfeImportItemAttempt

export const SECOND_IMPORT_ITEM = {
  attempt: 1n,
  companyId: COMPANY_ID,
  error: { code: 'XML_INVALID', message: 'XML is invalid' },
  id: SECOND_ITEM_ID,
  importId: IMPORT_ID,
  ordinal: 2n,
  previousAttempt: null,
  previousItemId: null,
  sourceEntry: 'batch/second.xml',
  sourceName: 'batch.zip',
  sourceObjectId: SECOND_OBJECT_ID,
  sourceSha256: '2222222222222222222222222222222222222222222222222222222222222222',
  status: 'invalid',
} as const satisfies NfeImportItemAttempt
