/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'

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
export type NfeImportSafeError = { readonly code: string; readonly message: string }
export type NfeImportSourceDescriptor = {
  readonly contentLength: number
  readonly contentType: string
  readonly objectId: string
  readonly sha256: string
  readonly sourceEntry: string
  readonly sourceName: string
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
export type NfeImportItem = {
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
  readonly variant?: 'complete' | 'summary' | 'event'
}
export type NfeImportItemDraft = Omit<NfeImportItem, 'id'>
export type NfeImportDetail = NfeImportSummary & { readonly items: readonly NfeImportItem[] }
export type NfeImportListPage = {
  readonly items: readonly NfeImportSummary[]
  readonly nextCursor: string | null
}
export type ImportLookup = { readonly companyId: string; readonly importId: string }
export type OutboxInput = {
  readonly actorUserId: string
  readonly aggregateId: string
  readonly aggregateType: 'nfe_import'
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly eventType: 'transportada.nfe.import.requested'
  readonly eventVersion: 1
  readonly payload: { readonly importId: string }
}
export type IdempotencyFingerprintPort = {
  create(input: {
    readonly fields: readonly Uint8Array[]
    readonly operation: string
  }): Promise<string>
}
export type RequestNfeImportInput = {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly importId?: string
  readonly source: 'distribution' | 'upload'
  readonly stagedSources: readonly NfeImportSourceDescriptor[]
}
export type RequestNfeImportTransactionPort = {
  readonly setRequestFingerprint?: (fingerprint: string) => void
  createImport(
    input: Omit<NfeImportSummary, 'createdAt' | 'id' | 'updatedAt' | 'version'> & {
      readonly id?: string
    },
  ): Promise<NfeImportSummary>
  createItems(input: {
    readonly importId: string
    readonly items: readonly NfeImportItemDraft[]
  }): Promise<void>
  findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<{ readonly fingerprint: string; readonly response: NfeImportSummary } | null>
  saveIdempotency(input: {
    readonly companyId: string
    readonly fingerprint: string
    readonly idempotencyKey: string
    readonly operation: string
    readonly response: NfeImportSummary
  }): Promise<void>
  saveOutbox(input: OutboxInput): Promise<void>
}
export type RequestNfeImportUnitOfWorkPort = RequestNfeImportTransactionPort & {
  readonly execute?: <T>(
    operation: (transaction: RequestNfeImportTransactionPort) => Promise<T>,
  ) => Promise<T>
}
export type FinalizeNfeImportRepositoryPort = {
  findById(input: ImportLookup): Promise<NfeImportDetail | null>
  saveResult(input: {
    readonly companyId: string
    readonly importId: string
    readonly items: readonly Pick<NfeImportItem, 'error' | 'id' | 'status'>[]
    readonly summary: NfeImportSummary
  }): Promise<void>
}
export type CompensateNfeImportRepositoryPort = {
  fail(
    input: ImportLookup & { readonly error: NfeImportSafeError },
  ): Promise<NfeImportSummary | null>
}
export type NfeImportDetailReaderPort = {
  findById(input: ImportLookup): Promise<NfeImportDetail | null>
}
export type NfeImportListReaderPort = {
  list(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly limit: number
  }): Promise<NfeImportListPage>
}
export type ReprocessNfeImportTransactionPort = {
  findById(input: ImportLookup): Promise<NfeImportDetail | null>
  queueRetry(
    input: ImportLookup & { readonly items: readonly NfeImportItemDraft[] },
  ): Promise<NfeImportSummary>
  saveOutbox(input: OutboxInput): Promise<void>
}
export type ReprocessNfeImportUnitOfWorkPort = ReprocessNfeImportTransactionPort & {
  readonly execute?: <T>(
    operation: (transaction: ReprocessNfeImportTransactionPort) => Promise<T>,
  ) => Promise<T>
}
