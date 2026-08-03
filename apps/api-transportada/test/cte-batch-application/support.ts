import { expect } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  CteBatchPreviewProfileCatalogFixture,
  RECIPIENT_TAX_ID,
  SENDER_TAX_ID,
  createProfileFixture,
} from './preview-support.js'

export const COMPANY_CONTEXT = {
  companyId: 'company-001',
  membershipId: 'membership-001',
  permissions: new Set(['cte.manage', 'cte.submit']),
  userId: 'user-001',
} as const

export const CORRELATION_ID = 'correlation-001'
export const BATCH_ID = 'cte-batch-001'
export const DOCUMENT_ID = 'nfe-document-001'
export const SECOND_DOCUMENT_ID = 'nfe-document-002'
export const THIRD_DOCUMENT_ID = 'nfe-document-003'
export const ITEM_ID = 'cte-batch-item-001'
export const SECOND_ITEM_ID = 'cte-batch-item-002'
export const THIRD_ITEM_ID = 'cte-batch-item-003'
export const CALCULATION_ID = 'freight-calculation-001'
export const SECOND_CALCULATION_ID = 'freight-calculation-002'
export const THIRD_CALCULATION_ID = 'freight-calculation-003'
export const FREIGHT_RULE_VERSION_ID = '00000000-0000-4000-8000-0000000009a1'
export const FREIGHT_RULE_VERSION = '1'
export const IDEMPOTENCY_KEY = 'cte-batch-idempotency-001'
export const SUBMISSION_IDEMPOTENCY_KEY = 'cte-submit-idempotency-001'
export const FINGERPRINT = 'cte-batch-fingerprint-001'
export const SUBMISSION_FINGERPRINT = 'cte-submit-fingerprint-001'
export const OTHER_RECIPIENT_TAX_ID = '19354980000230'
export const BATCH_NAME = 'Lote CT-e julho'

export type CteBatchStatus = 'draft' | 'submitted' | 'in_flight' | 'done' | 'error' | 'cancelled'

export type CteBatchUseCaseContract = {
  readonly cancel: (input: Record<string, unknown>) => Promise<unknown>
  readonly create: (input: Record<string, unknown>) => Promise<unknown>
  readonly get: (input: Record<string, unknown>) => Promise<unknown>
  readonly removeItem: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
  readonly submit: (input: Record<string, unknown>) => Promise<unknown>
  readonly transition: (input: Record<string, unknown>) => Promise<unknown>
}

export type CteBatchItemFixture = {
  readonly batchId: string
  readonly companyId: string
  readonly documentIds: readonly string[]
  readonly id: string
  readonly position: string
}

export type CteBatchApplicationFactory = (options: {
  readonly fingerprintService: CteBatchFingerprintFixture
  readonly profiles: CteBatchPreviewProfileCatalogFixture
  readonly unitOfWork: CteBatchUnitOfWorkFixture
}) => CteBatchUseCaseContract

export const EXPECTED_BATCH_SUMMARY = {
  companyId: COMPANY_CONTEXT.companyId,
  correlationId: CORRELATION_ID,
  createdAt: '2026-07-22T20:00:00.000Z',
  id: BATCH_ID,
  itemCount: 1,
  name: BATCH_NAME,
  operatorUserId: COMPANY_CONTEXT.userId,
  status: 'draft',
  updatedAt: '2026-07-22T20:00:00.000Z',
  version: '1',
} as const

export const ELIGIBLE_DOCUMENT = {
  accessKey: '35260700000000000000550010000000011000000010',
  companyId: COMPANY_CONTEXT.companyId,
  grossWeight: '120.0000',
  id: DOCUMENT_ID,
  issuedAt: '2026-07-22T12:00:00.000Z',
  number: '1',
  recipientCity: 'ITIRAPUA',
  recipientState: 'SP',
  recipientTaxId: RECIPIENT_TAX_ID,
  senderCity: 'TAUBATE',
  senderState: 'SP',
  senderTaxId: SENDER_TAX_ID,
  series: '1',
  status: 'authorized',
  totalAmount: '10000.0000',
  variant: 'complete',
} as const

export const SECOND_ELIGIBLE_DOCUMENT = {
  ...ELIGIBLE_DOCUMENT,
  accessKey: '35260700000000000000550010000000021000000029',
  id: SECOND_DOCUMENT_ID,
  issuedAt: '2026-07-22T13:00:00.000Z',
  number: '2',
  totalAmount: '20000.0000',
} as const

export const THIRD_ELIGIBLE_DOCUMENT = {
  ...ELIGIBLE_DOCUMENT,
  accessKey: '35260700000000000000550010000000031000000038',
  id: THIRD_DOCUMENT_ID,
  issuedAt: '2026-07-22T14:00:00.000Z',
  number: '3',
  recipientTaxId: OTHER_RECIPIENT_TAX_ID,
  totalAmount: '5000.0000',
} as const

export const GRIS_COMPONENT = {
  amount: null,
  calculationType: 'percentage_of_cargo',
  label: 'GRIS',
  ordinal: '2',
  rate: '0.003000',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: null,
} as const

export function createCatalogFixture(
  overrides: Parameters<typeof createProfileFixture>[0] = {},
): CteBatchPreviewProfileCatalogFixture {
  return new CteBatchPreviewProfileCatalogFixture([createProfileFixture(overrides)])
}

export function decodeFingerprintFields(payload: unknown): readonly string[] {
  const fields = (payload as { readonly fields?: readonly Uint8Array[] }).fields ?? []
  const decoder = new TextDecoder()

  return fields.map((field) => decoder.decode(field))
}

export async function createCteBatchUseCaseForTest(
  unitOfWork: CteBatchUnitOfWorkFixture,
  fingerprint: CteBatchFingerprintFixture | string = FINGERPRINT,
  profiles: CteBatchPreviewProfileCatalogFixture = createCatalogFixture(),
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
    fingerprintService:
      typeof fingerprint === 'string' ? new CteBatchFingerprintFixture(fingerprint) : fingerprint,
    profiles,
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
  public readonly activeLinkQueries: Array<Record<string, unknown>> = []
  public readonly activeLinks = new Map<string, string>()
  public readonly batchQueries: Array<Record<string, unknown>> = []
  public readonly createdBatches: Array<Record<string, unknown>> = []
  public readonly createdEvents: Array<Record<string, unknown>> = []
  public readonly createdFreightCalculations: Array<Record<string, unknown>> = []
  public readonly createdItemCharges: Array<Record<string, unknown>> = []
  public readonly createdItemDocuments: Array<Record<string, unknown>> = []
  public readonly createdItems: Array<Record<string, unknown>> = []
  public readonly createdSubmissionRecords: Array<Record<string, unknown>> = []
  public readonly deletedItems: Array<Record<string, unknown>> = []
  public readonly documentQueries: Array<Record<string, unknown>> = []
  public readonly itemQueries: Array<Record<string, unknown>> = []
  public readonly itemsById = new Map<string, CteBatchItemFixture>()
  public readonly touchedBatches: Array<Record<string, unknown>> = []
  public readonly documentsById = new Map<string, Record<string, unknown>>([
    [DOCUMENT_ID, ELIGIBLE_DOCUMENT],
    [SECOND_DOCUMENT_ID, SECOND_ELIGIBLE_DOCUMENT],
    [THIRD_DOCUMENT_ID, THIRD_ELIGIBLE_DOCUMENT],
  ])
  public readonly executedTransactions: Array<'cte-batch'> = []
  public readonly idempotencyQueries: Array<Record<string, unknown>> = []
  public readonly ruleVersionQueries: Array<Record<string, unknown>> = []
  public readonly statusChanges: Array<Record<string, unknown>> = []
  public batch: Record<string, unknown> | null = EXPECTED_BATCH_SUMMARY
  public document: Record<string, unknown> | null | undefined = undefined
  public ruleVersion: Record<string, unknown> | null = {
    id: FREIGHT_RULE_VERSION_ID,
    version: FREIGHT_RULE_VERSION,
  }
  /** Espelha o pool real: enquanto a transação corre, a conexão dela está ocupada. */
  public isInsideTransaction = false
  public replayedCreate: Record<string, unknown> | null = null
  public replayedSubmission: Record<string, unknown> | null = null
  /** Simula um concorrente que tirou o lote de rascunho entre a leitura e a trava. */
  public touchConflict = false

  public async execute<TResponse>(
    operation: (transaction: CteBatchUnitOfWorkFixture) => Promise<TResponse>,
  ): Promise<TResponse> {
    this.executedTransactions.push('cte-batch')
    this.isInsideTransaction = true
    try {
      return await operation(this)
    } finally {
      this.isInsideTransaction = false
    }
  }

  public async findBatch(input: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    this.batchQueries.push(input)
    return this.batch
  }

  public async findActiveBatchLinks(
    input: Record<string, unknown>,
  ): Promise<readonly { readonly batchId: string; readonly documentId: string }[]> {
    this.activeLinkQueries.push(input)
    return readDocumentIds(input).flatMap((documentId) => {
      const batchId = this.activeLinks.get(documentId)
      return batchId === undefined ? [] : [{ batchId, documentId }]
    })
  }

  public async findSelectionDocuments(
    input: Record<string, unknown>,
  ): Promise<readonly Record<string, unknown>[]> {
    this.documentQueries.push(input)
    if (this.document !== undefined) return this.document === null ? [] : [this.document]
    return readDocumentIds(input).flatMap((documentId) => {
      const document = this.documentsById.get(documentId)
      return document === undefined ? [] : [document]
    })
  }

  public async findFreightRuleVersion(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    this.ruleVersionQueries.push(input)
    return this.ruleVersion
  }

  public async createFreightCalculation(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.createdFreightCalculations.push(input)
    const ordinal = String(this.createdFreightCalculations.length).padStart(3, '0')
    return { ...input, id: `freight-calculation-${ordinal}` }
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

  /** O repositório real insere o lote antes dos itens, então a linha volta sem contagem. */
  public async createBatch(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.createdBatches.push(input)
    return { ...EXPECTED_BATCH_SUMMARY, itemCount: 0 }
  }

  public async createBatchItem(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.createdItems.push(input)
    const ordinal = String(this.createdItems.length).padStart(3, '0')
    return { ...input, id: `cte-batch-item-${ordinal}` }
  }

  public async createBatchItemCharge(input: Record<string, unknown>): Promise<void> {
    this.createdItemCharges.push(input)
  }

  public async createBatchItemDocument(input: Record<string, unknown>): Promise<void> {
    this.createdItemDocuments.push(input)
  }

  public async createBatchEvent(input: Record<string, unknown>): Promise<void> {
    this.createdEvents.push(input)
  }

  public async createSubmissionRecord(input: Record<string, unknown>): Promise<void> {
    this.createdSubmissionRecords.push(input)
  }

  public async findBatchItem(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    this.itemQueries.push(input)
    const item = this.itemsById.get(String(input['itemId']))
    if (item === undefined) return null
    if (item.batchId !== input['batchId'] || item.companyId !== input['companyId']) return null

    return { ...item }
  }

  public async deleteBatchItem(
    input: Record<string, unknown>,
  ): Promise<{ readonly documentIds: readonly string[] }> {
    this.deletedItems.push(input)
    const item = this.itemsById.get(String(input['itemId']))
    if (item === undefined) return { documentIds: [] }
    this.itemsById.delete(item.id)
    for (const documentId of item.documentIds) this.activeLinks.delete(documentId)
    this.batch = { ...this.batch, itemCount: this.itemsById.size }

    return { documentIds: item.documentIds }
  }

  public async touchBatch(input: Record<string, unknown>): Promise<void> {
    this.touchedBatches.push(input)
    if (this.touchConflict || this.batch?.['status'] !== input['expectedStatus']) {
      throw new ApiError({
        code: 'CTE_BATCH_INVALID_STATE',
        message: 'CT-e batch state transition is not allowed',
        status: 409,
      })
    }
    this.batch = { ...this.batch, version: '2' }
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

function readDocumentIds(input: Record<string, unknown>): readonly string[] {
  return (input['documentIds'] as readonly string[] | undefined) ?? []
}
