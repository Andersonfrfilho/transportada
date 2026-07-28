/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  COMPANY_ID,
  CORRELATION_ID,
  IDEMPOTENCY_KEY,
  IMPORT_ID,
  OTHER_REQUEST_FINGERPRINT,
  QUEUED_IMPORT,
  REQUEST_FINGERPRINT,
  SAFE_CONFLICT_SENTINEL,
  UPLOAD_SOURCES,
  USER_ID,
  type NfeImportSummary,
} from '../fixtures/nfe-import-application.fixture'
import {
  captureApiError,
  createRequestNfeImportUseCaseFixture,
  type IdempotencyFingerprintPort,
  type NfeImportItemDraft,
  type RequestNfeImportUnitOfWorkPort,
} from '../fixtures/nfe-import-use-case.fixture'

describe('request nfe import application contract', () => {
  test('creates a queued tenant-scoped import, pending items, idempotency record, and outbox entry', async () => {
    const unitOfWork = new RequestNfeImportUnitOfWorkFixture()
    const useCase = await createRequestNfeImportUseCaseFixture({
      fingerprintService: createFingerprintFixture(REQUEST_FINGERPRINT),
      unitOfWork,
    })

    const result = await useCase.execute({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      source: 'upload',
      stagedSources: UPLOAD_SOURCES,
    })

    expect(result).toEqual(QUEUED_IMPORT)
    expect(unitOfWork.createdImports).toEqual([createExpectedImportDraft()])
    expect(unitOfWork.createdItems).toHaveLength(2)
    expect(unitOfWork.createdItems.map((item) => item.status)).toEqual(['pending', 'pending'])
    expect(unitOfWork.createdItems.map((item) => item.companyId)).toEqual([COMPANY_ID, COMPANY_ID])
    expect(unitOfWork.createdItems.map((item) => item.importId)).toEqual([IMPORT_ID, IMPORT_ID])
    expect(unitOfWork.createdItems.map((item) => item.ordinal)).toEqual([1n, 2n])
    expect(unitOfWork.createdItems.map((item) => item.sourceObjectId)).toEqual(
      UPLOAD_SOURCES.map((item) => item.objectId),
    )
    expect(unitOfWork.idempotencyRecords).toEqual([
      {
        companyId: COMPANY_ID,
        fingerprint: REQUEST_FINGERPRINT,
        idempotencyKey: IDEMPOTENCY_KEY,
        operation: 'nfe-import.request',
        response: QUEUED_IMPORT,
      },
    ])
    expect(unitOfWork.outboxEntries).toEqual([
      {
        actorUserId: USER_ID,
        aggregateId: IMPORT_ID,
        aggregateType: 'nfe_import',
        companyId: COMPANY_ID,
        correlationId: CORRELATION_ID,
        eventId: expect.any(String),
        eventType: 'transportada.nfe.import.requested',
        eventVersion: 1,
        payload: { importId: IMPORT_ID },
      },
    ])
    const persisted = stringifyWithBigInt({
      outboxEntries: unitOfWork.outboxEntries,
    })
    expect(persisted).not.toContain('first.xml')
    expect(persisted).not.toContain('batch.zip')
  })

  test('emits a distribution event when the source is distribution', async () => {
    const unitOfWork = new RequestNfeImportUnitOfWorkFixture()
    const useCase = await createRequestNfeImportUseCaseFixture({
      fingerprintService: createFingerprintFixture(REQUEST_FINGERPRINT),
      unitOfWork,
    })

    await useCase.execute({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      source: 'distribution',
      stagedSources: [],
    })

    expect(unitOfWork.createdImports.map((draft) => draft.source)).toEqual(['distribution'])
    expect(unitOfWork.outboxEntries.map((entry) => entry.eventType)).toEqual([
      'transportada.nfe.distribution.requested',
    ])
    expect(unitOfWork.outboxEntries.map((entry) => entry.payload)).toEqual([
      { importId: IMPORT_ID },
    ])
  })

  test('replays a matching idempotency request without duplicating import, items, or outbox', async () => {
    const unitOfWork = new RequestNfeImportUnitOfWorkFixture()
    unitOfWork.replayedIdempotency = {
      fingerprint: REQUEST_FINGERPRINT,
      response: QUEUED_IMPORT,
    }
    const useCase = await createRequestNfeImportUseCaseFixture({
      fingerprintService: createFingerprintFixture(REQUEST_FINGERPRINT),
      unitOfWork,
    })

    const result = await useCase.execute({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      source: 'upload',
      stagedSources: UPLOAD_SOURCES,
    })

    expect(result).toEqual(QUEUED_IMPORT)
    expect(unitOfWork.createdImports).toEqual([])
    expect(unitOfWork.createdItems).toEqual([])
    expect(unitOfWork.outboxEntries).toEqual([])
    expect(unitOfWork.idempotencyRecords).toEqual([])
  })

  test('rejects a divergent idempotency replay without exposing tenant or fingerprint details', async () => {
    const unitOfWork = new RequestNfeImportUnitOfWorkFixture()
    unitOfWork.replayedIdempotency = {
      fingerprint: OTHER_REQUEST_FINGERPRINT,
      response: QUEUED_IMPORT,
    }
    const useCase = await createRequestNfeImportUseCaseFixture({
      fingerprintService: createFingerprintFixture(REQUEST_FINGERPRINT),
      unitOfWork,
    })

    const error = await captureApiError(() =>
      useCase.execute({
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        source: 'upload',
        stagedSources: UPLOAD_SOURCES,
      }),
    )

    expect(error).toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'Idempotency key cannot be reused',
      status: 409,
    })
    expect(JSON.stringify(error)).not.toContain(COMPANY_ID)
    expect(JSON.stringify(error)).not.toContain(REQUEST_FINGERPRINT)
    expect(JSON.stringify(error)).not.toContain(SAFE_CONFLICT_SENTINEL)
    expect(unitOfWork.createdImports).toEqual([])
    expect(unitOfWork.outboxEntries).toEqual([])
  })
})

class RequestNfeImportUnitOfWorkFixture implements RequestNfeImportUnitOfWorkPort {
  public readonly createdImports: Array<
    Omit<NfeImportSummary, 'createdAt' | 'id' | 'updatedAt' | 'version'>
  > = []
  public readonly createdItems: NfeImportItemDraft[] = []
  public readonly idempotencyRecords: Array<{
    readonly companyId: string
    readonly fingerprint: string
    readonly idempotencyKey: string
    readonly operation: string
    readonly response: NfeImportSummary
  }> = []
  public readonly outboxEntries: Array<{
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
  }> = []
  public replayedIdempotency: {
    readonly fingerprint: string
    readonly response: NfeImportSummary
  } | null = null

  async createImport(
    input: Omit<NfeImportSummary, 'createdAt' | 'id' | 'updatedAt' | 'version'>,
  ): Promise<NfeImportSummary> {
    this.createdImports.push(structuredClone(input))
    return QUEUED_IMPORT
  }

  async createItems(input: {
    readonly importId: string
    readonly items: readonly NfeImportItemDraft[]
  }): Promise<void> {
    expect(input.importId).toBe(IMPORT_ID)
    this.createdItems.push(...structuredClone(input.items))
  }

  async findIdempotency(): Promise<{
    readonly fingerprint: string
    readonly response: NfeImportSummary
  } | null> {
    return this.replayedIdempotency
  }

  async saveIdempotency(input: {
    readonly companyId: string
    readonly fingerprint: string
    readonly idempotencyKey: string
    readonly operation: string
    readonly response: NfeImportSummary
  }): Promise<void> {
    this.idempotencyRecords.push(structuredClone(input))
  }

  async saveOutbox(input: {
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
  }): Promise<void> {
    this.outboxEntries.push(structuredClone(input))
  }
}

function createFingerprintFixture(fingerprint: string): IdempotencyFingerprintPort {
  return {
    async create(input) {
      expect(input.operation).toBe('nfe-import.request')
      return fingerprint
    },
  }
}

function createExpectedImportDraft(): Omit<
  NfeImportSummary,
  'createdAt' | 'id' | 'updatedAt' | 'version'
> {
  return {
    companyId: COMPANY_ID,
    correlationId: CORRELATION_ID,
    duplicatedCount: 0n,
    failedCount: 0n,
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
  }
}

function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  )
}
