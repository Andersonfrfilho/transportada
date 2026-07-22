/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  COMPANY_ID,
  CORRELATION_ID,
  FAILED_IMPORT,
  IMPORT_ITEM,
  IMPORT_ID,
  ITEM_ID,
  QUEUED_IMPORT,
  SECOND_IMPORT_ITEM,
  USER_ID,
  type NfeImportDetail,
  type NfeImportSummary,
} from '../fixtures/nfe-import-application.fixture'
import {
  captureApiError,
  createReprocessNfeImportUseCaseFixture,
  type NfeImportItemDraft,
  type ReprocessNfeImportUnitOfWorkPort,
} from '../fixtures/nfe-import-use-case.fixture'

describe('reprocess nfe import application contract', () => {
  test('queues a new attempt for a failed import without mutating immutable source lineage', async () => {
    const unitOfWork = new ReprocessNfeImportUnitOfWorkFixture()
    const useCase = await createReprocessNfeImportUseCaseFixture({ unitOfWork })

    const result = await useCase.execute({
      context: COMPANY_CONTEXT,
      importId: IMPORT_ID,
    })

    expect(result).toMatchObject({
      companyId: COMPANY_ID,
      id: IMPORT_ID,
      status: 'queued',
      terminalError: null,
    } satisfies Partial<NfeImportSummary>)
    expect(unitOfWork.queuedRetryItems).toEqual([
      {
        attempt: 2n,
        companyId: COMPANY_ID,
        error: null,
        importId: IMPORT_ID,
        ordinal: 1n,
        previousAttempt: 1n,
        previousItemId: ITEM_ID,
        sourceEntry: IMPORT_ITEM.sourceEntry,
        sourceName: IMPORT_ITEM.sourceName,
        sourceObjectId: IMPORT_ITEM.sourceObjectId,
        sourceSha256: IMPORT_ITEM.sourceSha256,
        status: 'pending',
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
  })

  test('rejects reprocess for an import already completed or still active', async () => {
    const unitOfWork = new ReprocessNfeImportUnitOfWorkFixture()
    unitOfWork.detail = {
      ...QUEUED_IMPORT,
      items: [IMPORT_ITEM],
      status: 'completed',
    }
    const useCase = await createReprocessNfeImportUseCaseFixture({ unitOfWork })

    const error = await captureApiError(() =>
      useCase.execute({
        context: COMPANY_CONTEXT,
        importId: IMPORT_ID,
      }),
    )

    expect(error).toMatchObject({
      code: 'NFE_IMPORT_REPROCESS_NOT_ALLOWED',
      message: 'NF-e import cannot be reprocessed',
      status: 409,
    })
    expect(unitOfWork.queuedRetryItems).toEqual([])
    expect(unitOfWork.outboxEntries).toEqual([])
  })
})

class ReprocessNfeImportUnitOfWorkFixture implements ReprocessNfeImportUnitOfWorkPort {
  public detail: NfeImportDetail | null = {
    ...FAILED_IMPORT,
    items: [IMPORT_ITEM, SECOND_IMPORT_ITEM],
  }
  public readonly outboxEntries: Array<{
    readonly actorUserId: string
    readonly aggregateId: string
    readonly aggregateType: 'nfe_import'
    readonly companyId: string
    readonly correlationId: string
    readonly eventId: string
    readonly eventType: 'transportada.nfe.import.requested'
    readonly eventVersion: 1
    readonly payload: { readonly importId: string }
  }> = []
  public readonly queuedRetryItems: NfeImportItemDraft[] = []

  async findById(): Promise<NfeImportDetail | null> {
    return this.detail
  }

  async queueRetry(input: {
    readonly companyId: string
    readonly importId: string
    readonly items: readonly NfeImportItemDraft[]
  }): Promise<NfeImportSummary> {
    expect(input.companyId).toBe(COMPANY_ID)
    expect(input.importId).toBe(IMPORT_ID)
    this.queuedRetryItems.push(...structuredClone(input.items))
    return {
      ...QUEUED_IMPORT,
      terminalError: null,
      version: 3n,
    }
  }

  async saveOutbox(input: {
    readonly actorUserId: string
    readonly aggregateId: string
    readonly aggregateType: 'nfe_import'
    readonly companyId: string
    readonly correlationId: string
    readonly eventId: string
    readonly eventType: 'transportada.nfe.import.requested'
    readonly eventVersion: 1
    readonly payload: { readonly importId: string }
  }): Promise<void> {
    this.outboxEntries.push(structuredClone(input))
  }
}
