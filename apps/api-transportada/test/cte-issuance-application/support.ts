/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { expect } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'

export type CteIssuanceStatus =
  | 'requested'
  | 'authorized'
  | 'rejected'
  | 'retry_scheduled'
  | 'failed'

export type CteIssuanceRecord = {
  readonly batchId: string
  readonly companyId: string
  readonly context: {
    readonly batchItemId: string
    readonly companyId: string
    readonly fiscalEnvironment: 'homologation' | 'production'
    readonly fiscalNumber: string
    readonly fiscalSeries: string
    readonly status: CteIssuanceStatus
    readonly reasonCode?: string
    readonly reasonCause?: string
    readonly retryCount: number
    readonly attemptKind: 'issue' | 'reprocess'
    readonly attemptNumber: number
    readonly correlationId: string
    readonly idempotencyKey: string
    readonly fingerprint: string
  }
  readonly protocol?: string
  readonly accessKey?: string
  readonly issueRequestedAt?: string
}

export type CteIssuanceUseCaseContract = {
  readonly issue: (input: unknown) => Promise<unknown>
  readonly reprocess: (input: unknown) => Promise<unknown>
  readonly getIssuance: (input: unknown) => Promise<unknown>
}

export type CteIssuanceUseCaseFactory = (input: {
  readonly fingerprintService: CteIssuanceFingerprintService
  readonly unitOfWork: CteIssuanceUnitOfWorkFixture
}) => CteIssuanceUseCaseContract

export type CteIssuanceFingerprintService = {
  readonly create: (input: unknown) => Promise<string> | string
}

export type CteIssuanceIssueInput = {
  readonly context: {
    readonly companyId: string
    readonly kind: 'company'
    readonly membershipId: string
    readonly permissions: Set<string>
    readonly roles: readonly string[]
    readonly userId: string
  }
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly batchId: string
}

export type CteIssuanceReprocessInput = {
  readonly context: CteIssuanceIssueInput['context']
  readonly batchId: string
  readonly batchItemId: string
  readonly correlationId: string
  readonly idempotencyKey: string
}

export const COMPANY_CONTEXT = {
  companyId: 'company-001',
  kind: 'company' as const,
  membershipId: 'membership-001',
  permissions: new Set(['cte.read', 'cte.manage', 'cte.submit']),
  roles: ['company-admin'],
  userId: 'user-001',
}

export const CORRELATION_ID = 'correlation-001'
export const BATCH_ID = 'cte-batch-001'
export const BATCH_ITEM_ID = 'cte-batch-item-001'
export const OTHER_BATCH_ID = 'cte-batch-002'
export const OTHER_BATCH_ITEM_ID = 'cte-batch-item-002'
export const IDEMPOTENCY_KEY = 'cte-issue-idempotency-001'
export const REPROCESS_IDEMPOTENCY_KEY = 'cte-reprocess-idempotency-001'
export const ISSUE_FINGERPRINT = 'cte-issue-fingerprint-001'
export const REPROCESS_FINGERPRINT = 'cte-reprocess-fingerprint-001'

export const ISSUE_COMMAND_RESULT = {
  attemptId: 'attempt-001',
  attemptKind: 'issue',
  attemptNumber: 1,
  batchId: BATCH_ID,
  batchItemId: BATCH_ITEM_ID,
  companyId: COMPANY_CONTEXT.companyId,
  fiscalEnvironment: 'homologation',
  fiscalSeries: '1',
  fiscalNumber: '100000001',
  idempotencyKey: IDEMPOTENCY_KEY,
  status: 'requested',
} as const

export async function createCteIssuanceUseCaseForTest(
  unitOfWork: CteIssuanceUnitOfWorkFixture,
  issueFingerprint = ISSUE_FINGERPRINT,
): Promise<CteIssuanceUseCaseContract> {
  let moduleExports: Record<string, unknown>

  try {
    moduleExports = (await import(
      '../../src/cte-issuance/application/cte-issuance.use-case.js'
    )) as Record<string, unknown>
  } catch (error) {
    throw new Error(`T006 application implementation is missing: ${String(error)}`)
  }

  const factory = moduleExports['createCteIssuanceUseCase'] as CteIssuanceUseCaseFactory | undefined
  expect(typeof factory).toBe('function')
  if (factory === undefined) throw new Error('CT-e issuance use case factory is missing')

  return factory({
    fingerprintService: new CteIssuanceFingerprintFixture(issueFingerprint),
    unitOfWork,
  })
}

export class CteIssuanceFingerprintFixture {
  public readonly payloads: readonly unknown[] = []
  private readonly fingerprint: string

  public constructor(fingerprint: string) {
    this.fingerprint = fingerprint
  }

  public create(payload: unknown): string {
    ;(this.payloads as unknown[]).push(payload)
    return this.fingerprint
  }
}

export class CteIssuanceUnitOfWorkFixture {
  public readonly issueIdempotencyQueries: Array<Record<string, unknown>> = []
  public readonly batchQueries: Array<Record<string, unknown>> = []
  public readonly batchItemQueries: Array<Record<string, unknown>> = []
  public readonly commandOutbox: Array<Record<string, unknown>> = []
  public readonly events: Array<Record<string, unknown>> = []
  public readonly attempts: Array<Record<string, unknown>> = []
  public readonly retries: Array<Record<string, unknown>> = []
  public readonly executedTransactions: Array<'cte-issuance'> = []
  public readonly lookupQueries: Array<Record<string, unknown>> = []

  public batch: Record<string, unknown> | null = {
    companyId: COMPANY_CONTEXT.companyId,
    id: BATCH_ID,
    status: 'submitted',
  }
  public batchItem: Record<string, unknown> | null = {
    id: BATCH_ITEM_ID,
    batchId: BATCH_ID,
    companyId: COMPANY_CONTEXT.companyId,
    status: 'approved',
  }
  public issueReplay: { readonly requestFingerprint: string; readonly response: unknown } | null =
    null
  public reprocessReplay: {
    readonly requestFingerprint: string
    readonly response: unknown
  } | null = null
  public issuanceResult: CteIssuanceRecord | null = null
  public rejectedIssuance: CteIssuanceRecord | null = {
    batchId: BATCH_ID,
    companyId: COMPANY_CONTEXT.companyId,
    context: {
      batchItemId: BATCH_ITEM_ID,
      companyId: COMPANY_CONTEXT.companyId,
      fiscalEnvironment: 'homologation',
      fiscalNumber: '100000001',
      fiscalSeries: '1',
      status: 'rejected',
      reasonCode: 'FISCAL_REJECTION',
      reasonCause: 'Rejected by SEFAZ',
      retryCount: 0,
      attemptKind: 'issue',
      attemptNumber: 1,
      correlationId: CORRELATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      fingerprint: ISSUE_FINGERPRINT,
    },
  }
  public retryIssuance: CteIssuanceRecord | null = {
    batchId: BATCH_ID,
    companyId: COMPANY_CONTEXT.companyId,
    context: {
      batchItemId: BATCH_ITEM_ID,
      companyId: COMPANY_CONTEXT.companyId,
      fiscalEnvironment: 'homologation',
      fiscalNumber: '100000002',
      fiscalSeries: '1',
      status: 'retry_scheduled',
      reasonCode: 'TECHNICAL_TIMEOUT',
      reasonCause: 'provider timeout',
      retryCount: 1,
      attemptKind: 'issue',
      attemptNumber: 2,
      correlationId: CORRELATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      fingerprint: ISSUE_FINGERPRINT,
    },
    issueRequestedAt: '2026-07-22T20:00:00.000Z',
  }
  public failedIssuance: CteIssuanceRecord | null = {
    batchId: BATCH_ID,
    companyId: COMPANY_CONTEXT.companyId,
    context: {
      batchItemId: BATCH_ITEM_ID,
      companyId: COMPANY_CONTEXT.companyId,
      fiscalEnvironment: 'homologation',
      fiscalNumber: '100000003',
      fiscalSeries: '1',
      status: 'failed',
      reasonCode: 'UNRECOVERABLE',
      reasonCause: 'permanent storage failure',
      retryCount: 3,
      attemptKind: 'issue',
      attemptNumber: 2,
      correlationId: CORRELATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      fingerprint: ISSUE_FINGERPRINT,
    },
  }

  public async execute<TResponse>(
    operation: (transaction: CteIssuanceUnitOfWorkFixture) => Promise<TResponse>,
  ): Promise<TResponse> {
    this.executedTransactions.push('cte-issuance')
    return operation(this)
  }

  public async findBatch(input: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    this.batchQueries.push(input)
    return this.batch
  }

  public async findBatchItem(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    this.batchItemQueries.push(input)
    return this.batchItem
  }

  public async findIssuanceReplay(input: Record<string, unknown>): Promise<{
    readonly requestFingerprint: string
    readonly response: unknown
  } | null> {
    this.issueIdempotencyQueries.push(input)
    if (input['idempotencyKey'] === IDEMPOTENCY_KEY) return this.issueReplay
    if (input['idempotencyKey'] === REPROCESS_IDEMPOTENCY_KEY) return this.reprocessReplay
    return null
  }

  public async saveIssuanceReplay(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly requestFingerprint: string
    readonly response: unknown
  }): Promise<void> {
    if (input.idempotencyKey === IDEMPOTENCY_KEY) {
      this.issueReplay = { requestFingerprint: input.requestFingerprint, response: input.response }
    } else {
      this.reprocessReplay = {
        requestFingerprint: input.requestFingerprint,
        response: input.response,
      }
    }
  }

  public async findIssuance(input: Record<string, unknown>): Promise<CteIssuanceRecord | null> {
    this.lookupQueries.push(input)
    if (input['includeRejected']) return this.rejectedIssuance
    if (input['includeRetry']) return this.retryIssuance
    if (input['includeFailed']) return this.failedIssuance
    if (input['includeAuthorized'] || input['includeReplay']) {
      return this.issuanceResult
    }
    return this.issuanceResult
  }

  public async createIssuance(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.attempts.push(input)
    return {
      ...ISSUE_COMMAND_RESULT,
      ...input,
    }
  }

  public async reserveFiscalNumber(input: Record<string, unknown>): Promise<{
    readonly id: string
    readonly fiscalSeries: string
    readonly fiscalNumber: string
    readonly companyId: string
  }> {
    return {
      id: 'reservation-001',
      companyId: input['companyId'] as string,
      fiscalSeries: '1',
      fiscalNumber: input['kind'] === 'reprocess' ? '100000002' : '100000001',
    }
  }

  public async scheduleRetry(input: Record<string, unknown>): Promise<void> {
    this.retries.push(input)
  }

  public async appendEvent(input: Record<string, unknown>): Promise<void> {
    this.events.push(input)
  }

  public async pushOutbox(input: Record<string, unknown>): Promise<void> {
    this.commandOutbox.push(input)
  }
}

export async function captureApiError(callback: () => Promise<unknown>): Promise<ApiError> {
  try {
    await callback()
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('Expected ApiError to be thrown')
}
