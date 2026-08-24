/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  JobExecutionOrigin,
  JobOutcome,
  ScheduledJob,
} from '../../shared/job-catalog.constant.js'

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
  readonly eventType:
    | 'transportada.nfe.distribution.requested'
    | 'transportada.nfe.import.requested'
  readonly eventVersion: 1
  readonly payload: { readonly importId: string }
}
export type NfeFiscalEnvironment = 'homologation' | 'production'
export type NfeDistributionCursorSnapshot = {
  readonly leaseExpiresAt: string | null
  readonly maxNsu: string
  readonly nextAllowedAt: string | null
  readonly ultNsu: string
  readonly updatedAt: string
} | null
export type NfeDistributionStatus = {
  readonly canPull: boolean
  readonly environment: NfeFiscalEnvironment
  readonly lastPulledAt: string | null
  readonly maxNsu: string
  readonly nextAllowedAt: string | null
  readonly pullInProgress: boolean
  readonly ultNsu: string
}
export type NfeDistributionStatusReaderPort = {
  read(input: { readonly companyId: string }): Promise<{
    readonly cursor: NfeDistributionCursorSnapshot
    readonly environment: NfeFiscalEnvironment
  } | null>
}
export type NfeDistributionClockPort = { now(): Date }
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
  /**
   * Opcional porque o caminho de upload não é rotina nenhuma: quem importa XML à mão não está
   * antecipando uma janela agendada, e uma execução gravada ali seria histórico de rotina que não
   * correu.
   */
  recordManualJobRun?(input: ManualJobRunInput): Promise<void>
  saveOutbox(input: OutboxInput): Promise<void>
}
export type ManualJobRunInput = {
  readonly companyId: string
  readonly correlationId: string
  readonly counters: Readonly<Record<string, number>>
  readonly job: ScheduledJob
  readonly outcome: JobOutcome
  readonly requestedBy: string
}
/**
 * O que a tela mostra de uma execução: números e rótulos estáveis, nunca texto de erro — quem traduz
 * o `outcome` é o painel, e mensagem crua de rotina não é feita para o operador ler.
 */
export type JobRunSnapshot = {
  readonly counters: Readonly<Record<string, number>>
  readonly finishedAt: string | null
  readonly origin: JobExecutionOrigin
  readonly outcome: JobOutcome | null
  readonly startedAt: string
}
export type LastJobRunReaderPort = {
  readLastRun(input: {
    readonly companyId: string
    readonly job: ScheduledJob
  }): Promise<JobRunSnapshot | null>
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
    readonly filters?: {
      readonly correlationIdEq?: string
      readonly correlationIdNe?: string
      readonly createdFrom?: string
      readonly createdUntil?: string
      readonly duplicatedCountEq?: string
      readonly duplicatedCountGt?: string
      readonly duplicatedCountGte?: string
      readonly duplicatedCountLt?: string
      readonly duplicatedCountLte?: string
      readonly duplicatedCountNe?: string
      readonly failedCountEq?: string
      readonly failedCountGt?: string
      readonly failedCountGte?: string
      readonly failedCountLt?: string
      readonly failedCountLte?: string
      readonly failedCountNe?: string
      readonly idEq?: string
      readonly idNe?: string
      readonly importedCountEq?: string
      readonly importedCountGt?: string
      readonly importedCountGte?: string
      readonly importedCountLt?: string
      readonly importedCountLte?: string
      readonly importedCountNe?: string
      readonly invalidCountEq?: string
      readonly invalidCountGt?: string
      readonly invalidCountGte?: string
      readonly invalidCountLt?: string
      readonly invalidCountLte?: string
      readonly invalidCountNe?: string
      readonly processedCountEq?: string
      readonly processedCountGt?: string
      readonly processedCountGte?: string
      readonly processedCountLt?: string
      readonly processedCountLte?: string
      readonly processedCountNe?: string
      readonly receivedCountEq?: string
      readonly receivedCountGt?: string
      readonly receivedCountGte?: string
      readonly receivedCountLt?: string
      readonly receivedCountLte?: string
      readonly receivedCountNe?: string
      readonly rejectedCountEq?: string
      readonly rejectedCountGt?: string
      readonly rejectedCountGte?: string
      readonly rejectedCountLt?: string
      readonly rejectedCountLte?: string
      readonly rejectedCountNe?: string
      readonly requestedByUserIdEq?: string
      readonly requestedByUserIdNe?: string
      readonly sourceEq?: 'distribution' | 'upload'
      readonly sourceNe?: 'distribution' | 'upload'
      readonly statusEq?: NfeImportStatus
      readonly statusNe?: NfeImportStatus
      readonly updatedFrom?: string
      readonly updatedUntil?: string
      readonly versionEq?: string
      readonly versionGt?: string
      readonly versionGte?: string
      readonly versionLt?: string
      readonly versionLte?: string
      readonly versionNe?: string
    }
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
