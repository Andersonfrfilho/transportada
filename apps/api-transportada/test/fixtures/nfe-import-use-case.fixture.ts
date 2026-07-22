/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../src/shared/api.error'
import type {
  NfeImportDetail,
  NfeImportItemAttempt,
  NfeImportListPage,
  NfeImportSafeError,
  NfeImportSourceDescriptor,
  NfeImportSummary,
} from './nfe-import-application.fixture'
import type { CompanyContext } from '../../src/identity/domain/tenant-context'

export type NfeImportItemDraft = Omit<NfeImportItemAttempt, 'id'>

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

export type RequestNfeImportUseCase = {
  execute(input: RequestNfeImportInput): Promise<NfeImportSummary>
}

export type RequestNfeImportUnitOfWorkPort = {
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
  }): Promise<{
    readonly fingerprint: string
    readonly response: NfeImportSummary
  } | null>
  saveIdempotency(input: {
    readonly companyId: string
    readonly fingerprint: string
    readonly idempotencyKey: string
    readonly operation: string
    readonly response: NfeImportSummary
  }): Promise<void>
  saveOutbox(input: {
    readonly actorUserId: string
    readonly aggregateId: string
    readonly aggregateType: 'nfe_import'
    readonly companyId: string
    readonly correlationId: string
    readonly eventId: string
    readonly eventType: 'transportada.nfe.import.requested'
    readonly eventVersion: 1
    readonly payload: { readonly importId: string }
  }): Promise<void>
}

type CreateRequestNfeImportUseCase = (input: {
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly unitOfWork: RequestNfeImportUnitOfWorkPort
}) => RequestNfeImportUseCase

export type FinalizeNfeImportInput = {
  readonly context: CompanyContext
  readonly importId: string
  readonly itemResults: readonly Pick<NfeImportItemAttempt, 'error' | 'id' | 'status'>[]
}

export type FinalizeNfeImportUseCase = {
  execute(input: FinalizeNfeImportInput): Promise<NfeImportSummary>
}

export type FinalizeNfeImportRepositoryPort = {
  findById(input: {
    readonly companyId: string
    readonly importId: string
  }): Promise<NfeImportDetail | null>
  saveResult(input: {
    readonly companyId: string
    readonly importId: string
    readonly items: readonly Pick<NfeImportItemAttempt, 'error' | 'id' | 'status'>[]
    readonly summary: NfeImportSummary
  }): Promise<void>
}

type CreateFinalizeNfeImportUseCase = (input: {
  readonly repository: FinalizeNfeImportRepositoryPort
}) => FinalizeNfeImportUseCase

export type CompensateNfeImportInput = {
  readonly context: CompanyContext
  readonly error: NfeImportSafeError
  readonly importId: string
}

export type CompensateNfeImportUseCase = {
  execute(input: CompensateNfeImportInput): Promise<NfeImportSummary>
}

export type CompensateNfeImportRepositoryPort = {
  fail(input: {
    readonly companyId: string
    readonly error: NfeImportSafeError
    readonly importId: string
  }): Promise<NfeImportSummary | null>
}

type CreateCompensateNfeImportUseCase = (input: {
  readonly repository: CompensateNfeImportRepositoryPort
}) => CompensateNfeImportUseCase

export type GetNfeImportUseCase = {
  execute(input: {
    readonly context: CompanyContext
    readonly importId: string
  }): Promise<NfeImportDetail>
}

export type NfeImportDetailReaderPort = {
  findById(input: {
    readonly companyId: string
    readonly importId: string
  }): Promise<NfeImportDetail | null>
}

type CreateGetNfeImportUseCase = (input: {
  readonly repository: NfeImportDetailReaderPort
}) => GetNfeImportUseCase

export type ListNfeImportsUseCase = {
  execute(input: {
    readonly context: CompanyContext
    readonly cursor: string | null
    readonly limit: number
  }): Promise<NfeImportListPage>
}

export type NfeImportListReaderPort = {
  list(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly limit: number
  }): Promise<NfeImportListPage>
}

type CreateListNfeImportsUseCase = (input: {
  readonly repository: NfeImportListReaderPort
}) => ListNfeImportsUseCase

export type ReprocessNfeImportUseCase = {
  execute(input: {
    readonly context: CompanyContext
    readonly importId: string
  }): Promise<NfeImportSummary>
}

export type ReprocessNfeImportUnitOfWorkPort = {
  findById(input: {
    readonly companyId: string
    readonly importId: string
  }): Promise<NfeImportDetail | null>
  queueRetry(input: {
    readonly companyId: string
    readonly importId: string
    readonly items: readonly NfeImportItemDraft[]
  }): Promise<NfeImportSummary>
  saveOutbox(input: {
    readonly actorUserId: string
    readonly aggregateId: string
    readonly aggregateType: 'nfe_import'
    readonly companyId: string
    readonly correlationId: string
    readonly eventId: string
    readonly eventType: 'transportada.nfe.import.requested'
    readonly eventVersion: 1
    readonly payload: { readonly importId: string }
  }): Promise<void>
}

type CreateReprocessNfeImportUseCase = (input: {
  readonly unitOfWork: ReprocessNfeImportUnitOfWorkPort
}) => ReprocessNfeImportUseCase

export async function createRequestNfeImportUseCaseFixture(input: {
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly unitOfWork: RequestNfeImportUnitOfWorkPort
}): Promise<RequestNfeImportUseCase> {
  const module = (await import(
    '../../src/nfe-imports/application/request-nfe-import.use-case.js'
  )) as {
    readonly createRequestNfeImportUseCase: CreateRequestNfeImportUseCase
  }
  return module.createRequestNfeImportUseCase(input)
}

export async function createFinalizeNfeImportUseCaseFixture(input: {
  readonly repository: FinalizeNfeImportRepositoryPort
}): Promise<FinalizeNfeImportUseCase> {
  const module = (await import(
    '../../src/nfe-imports/application/finalize-nfe-import.use-case.js'
  )) as {
    readonly createFinalizeNfeImportUseCase: CreateFinalizeNfeImportUseCase
  }
  return module.createFinalizeNfeImportUseCase(input)
}

export async function createCompensateNfeImportUseCaseFixture(input: {
  readonly repository: CompensateNfeImportRepositoryPort
}): Promise<CompensateNfeImportUseCase> {
  const module = (await import(
    '../../src/nfe-imports/application/compensate-nfe-import.use-case.js'
  )) as {
    readonly createCompensateNfeImportUseCase: CreateCompensateNfeImportUseCase
  }
  return module.createCompensateNfeImportUseCase(input)
}

export async function createGetNfeImportUseCaseFixture(input: {
  readonly repository: NfeImportDetailReaderPort
}): Promise<GetNfeImportUseCase> {
  const module = (await import('../../src/nfe-imports/application/get-nfe-import.use-case.js')) as {
    readonly createGetNfeImportUseCase: CreateGetNfeImportUseCase
  }
  return module.createGetNfeImportUseCase(input)
}

export async function createListNfeImportsUseCaseFixture(input: {
  readonly repository: NfeImportListReaderPort
}): Promise<ListNfeImportsUseCase> {
  const module = (await import(
    '../../src/nfe-imports/application/list-nfe-imports.use-case.js'
  )) as {
    readonly createListNfeImportsUseCase: CreateListNfeImportsUseCase
  }
  return module.createListNfeImportsUseCase(input)
}

export async function createReprocessNfeImportUseCaseFixture(input: {
  readonly unitOfWork: ReprocessNfeImportUnitOfWorkPort
}): Promise<ReprocessNfeImportUseCase> {
  const module = (await import(
    '../../src/nfe-imports/application/reprocess-nfe-import.use-case.js'
  )) as {
    readonly createReprocessNfeImportUseCase: CreateReprocessNfeImportUseCase
  }
  return module.createReprocessNfeImportUseCase(input)
}

export async function captureApiError(operation: () => Promise<unknown>): Promise<ApiError> {
  try {
    await operation()
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('Expected operation to fail')
}
