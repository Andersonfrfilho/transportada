import { expect } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'

export const COMPANY_CONTEXT = {
  companyId: 'company-001',
  membershipId: 'membership-001',
  permissions: new Set(['cte.manage', 'cte.submit']),
  userId: 'user-001',
} as const

export const CORRELATION_ID = 'correlation-001'
export const BATCH_ID = 'cte-batch-001'
export const DOCUMENT_ID = 'nfe-document-001'
export const CALCULATION_ID = 'freight-calculation-001'
export const IDEMPOTENCY_KEY = 'cte-batch-idempotency-001'
export const SUBMISSION_IDEMPOTENCY_KEY = 'cte-submit-idempotency-001'
export const FINGERPRINT = 'cte-batch-fingerprint-001'
export const SUBMISSION_FINGERPRINT = 'cte-submit-fingerprint-001'

export type CteBatchStatus = 'draft' | 'submitted' | 'in_flight' | 'done' | 'error' | 'cancelled'

export type CteBatchUseCaseContract = {
  readonly cancel: (input: Record<string, unknown>) => Promise<unknown>
  readonly create: (input: Record<string, unknown>) => Promise<unknown>
  readonly get: (input: Record<string, unknown>) => Promise<unknown>
  readonly submit: (input: Record<string, unknown>) => Promise<unknown>
  readonly transition: (input: Record<string, unknown>) => Promise<unknown>
}

export type CteBatchApplicationFactory = (options: {
  readonly fingerprintService: CteBatchFingerprintFixture
  readonly unitOfWork: CteBatchUnitOfWorkFixture
}) => CteBatchUseCaseContract

export const EXPECTED_BATCH_SUMMARY = {
  companyId: COMPANY_CONTEXT.companyId,
  correlationId: CORRELATION_ID,
  createdAt: '2026-07-22T20:00:00.000Z',
  id: BATCH_ID,
  itemCount: 1,
  name: 'Lote CT-e julho',
  operatorUserId: COMPANY_CONTEXT.userId,
  status: 'draft',
  updatedAt: '2026-07-22T20:00:00.000Z',
  version: '1',
} as const

export const ELIGIBLE_DOCUMENT = {
  accessKey: '35260700000000000000550010000000011000000010',
  companyId: COMPANY_CONTEXT.companyId,
  id: DOCUMENT_ID,
  issuedAt: '2026-07-22T12:00:00.000Z',
  status: 'authorized',
  totalAmount: '10000.0000',
  variant: 'complete',
} as const

export const FREIGHT_CALCULATION = {
  calculationSnapshot: {
    calculatedAmount: '350.0000',
    freightCalculationId: CALCULATION_ID,
    ruleSnapshot: {
      percentage: '0.035000',
      ruleVersion: '1',
      type: 'percentage_of_invoice_total',
    },
    totalAmount: '350.0000',
  },
  companyId: COMPANY_CONTEXT.companyId,
  id: CALCULATION_ID,
  nfeDocumentId: DOCUMENT_ID,
  status: 'snapshotted',
} as const

export async function createCteBatchUseCaseForTest(
  unitOfWork: CteBatchUnitOfWorkFixture,
  fingerprint: string = FINGERPRINT,
): Promise<CteBatchUseCaseContract> {
  let moduleExports: Record<string, unknown>
  try {
    moduleExports = (await import(
      '../../src/cte-batches/application/cte-batch.use-case.js'
    )) as Record<string, unknown>
  } catch (error) {
    throw new Error(`T004 application implementation is missing: ${String(error)}`)
  }

  const factory = moduleExports['createCteBatchUseCase']
  expect(typeof factory).toBe('function')

  return (factory as CteBatchApplicationFactory)({
    fingerprintService: new CteBatchFingerprintFixture(fingerprint),
    unitOfWork,
  })
}

export class CteBatchFingerprintFixture {
  public readonly payloads: readonly unknown[] = []

  public constructor(private readonly fingerprint: string) {}

  public create(payload: unknown): string {
    ;(this.payloads as unknown[]).push(payload)
    return this.fingerprint
  }
}

export class CteBatchUnitOfWorkFixture {
  public readonly batchQueries: Array<Record<string, unknown>> = []
  public readonly createdBatches: Array<Record<string, unknown>> = []
  public readonly createdEvents: Array<Record<string, unknown>> = []
  public readonly createdItems: Array<Record<string, unknown>> = []
  public readonly createdSubmissionRecords: Array<Record<string, unknown>> = []
  public readonly documentQueries: Array<Record<string, unknown>> = []
  public readonly executedTransactions: Array<'cte-batch'> = []
  public readonly freightQueries: Array<Record<string, unknown>> = []
  public readonly idempotencyQueries: Array<Record<string, unknown>> = []
  public readonly statusChanges: Array<Record<string, unknown>> = []
  public batch: Record<string, unknown> | null = EXPECTED_BATCH_SUMMARY
  public document: Record<string, unknown> | null = ELIGIBLE_DOCUMENT
  public freightCalculation: Record<string, unknown> | null = FREIGHT_CALCULATION
  public replayedCreate: Record<string, unknown> | null = null
  public replayedSubmission: Record<string, unknown> | null = null

  public async execute<TResponse>(
    operation: (transaction: CteBatchUnitOfWorkFixture) => Promise<TResponse>,
  ): Promise<TResponse> {
    this.executedTransactions.push('cte-batch')
    return operation(this)
  }

  public async findBatch(input: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    this.batchQueries.push(input)
    return this.batch
  }

  public async findEligibleDocument(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    this.documentQueries.push(input)
    return this.document
  }

  public async findFreightCalculation(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    this.freightQueries.push(input)
    return this.freightCalculation
  }

  public async findSubmissionRecord(): Promise<Record<string, unknown> | null> {
    return this.replayedSubmission
  }

  public async findBatchByIdempotency(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    this.idempotencyQueries.push(input)
    return this.replayedCreate
  }

  public async createBatch(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.createdBatches.push(input)
    return EXPECTED_BATCH_SUMMARY
  }

  public async createBatchItem(input: Record<string, unknown>): Promise<void> {
    this.createdItems.push(input)
  }

  public async createBatchEvent(input: Record<string, unknown>): Promise<void> {
    this.createdEvents.push(input)
  }

  public async createSubmissionRecord(input: Record<string, unknown>): Promise<void> {
    this.createdSubmissionRecords.push(input)
  }

  public async updateBatchStatus(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.statusChanges.push(input)
    return {
      ...EXPECTED_BATCH_SUMMARY,
      status: input['nextStatus'],
      version: '2',
    }
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
