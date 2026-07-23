/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  BATCH_ID,
  BATCH_ITEM_ID,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  OTHER_BATCH_ID,
  OTHER_BATCH_ITEM_ID,
  REPROCESS_FINGERPRINT,
  REPROCESS_IDEMPOTENCY_KEY,
  ISSUE_COMMAND_RESULT,
  createCteIssuanceUseCaseForTest,
  CteIssuanceUnitOfWorkFixture,
  captureApiError,
} from './support.js'
import type {
  CteIssuanceRecord,
  CteIssuanceReprocessInput,
  CteIssuanceUseCaseContract,
} from './support.js'

function createReprocessInput(
  overrides: Partial<CteIssuanceReprocessInput> = {},
): CteIssuanceReprocessInput {
  return {
    batchId: BATCH_ID,
    batchItemId: BATCH_ITEM_ID,
    context: COMPANY_CONTEXT,
    correlationId: CORRELATION_ID,
    idempotencyKey: REPROCESS_IDEMPOTENCY_KEY,
    ...overrides,
  }
}

describe('CT-e issuance application reprocess contract', () => {
  test('reprocesses rejected items by scheduling a reissue attempt', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.issuanceResult = {
      ...(unitOfWork.rejectedIssuance as CteIssuanceRecord),
      context: {
        ...unitOfWork.rejectedIssuance!.context,
        attemptKind: 'issue',
        attemptNumber: 1,
      },
    }
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    const result = await useCase.reprocess(createReprocessInput())

    expect(result).toMatchObject({
      attemptKind: 'reprocess',
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      attemptNumber: 2,
      status: 'requested',
      correlationId: CORRELATION_ID,
      companyId: COMPANY_CONTEXT.companyId,
    })
    expect(unitOfWork.attempts).toHaveLength(1)
    expect(unitOfWork.attempts[0]).toMatchObject({
      attemptKind: 'reprocess',
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
    })
    expect(unitOfWork.commandOutbox).toHaveLength(1)
  })

  test('rejects reprocessing for already authorized items without creating extra attempts', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.issuanceResult = {
      ...(unitOfWork.rejectedIssuance as CteIssuanceRecord),
      context: {
        ...unitOfWork.rejectedIssuance!.context,
        status: 'authorized',
        attemptKind: 'issue',
      },
      protocol: 'ABC123',
      accessKey: '12345678901234567890123456789012345678901234',
    }
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    const error = await captureApiError(() => useCase.reprocess(createReprocessInput()))

    expect(error).toMatchObject({
      code: 'CTE_ISSUANCE_NOT_REPROCESSABLE',
      message: 'CT-e issuance cannot be reprocessed',
      status: 409,
    })
    expect(unitOfWork.attempts).toEqual([])
    expect(unitOfWork.commandOutbox).toEqual([])
    expect(JSON.stringify(error)).not.toContain(ISSUE_COMMAND_RESULT.attemptId)
  })

  test('replays reprocess idempotency safely when payload diverges', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.issuanceResult = {
      ...(unitOfWork.rejectedIssuance as CteIssuanceRecord),
      context: {
        ...unitOfWork.rejectedIssuance!.context,
        attemptKind: 'issue',
        attemptNumber: 1,
      },
    }
    unitOfWork.reprocessReplay = {
      requestFingerprint: 'another-reprocess-fingerprint',
      response: {
        ...ISSUE_COMMAND_RESULT,
        attemptKind: 'reprocess',
      },
    }
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
      REPROCESS_FINGERPRINT,
    )) as CteIssuanceUseCaseContract

    const error = await captureApiError(() =>
      useCase.reprocess(createReprocessInput({ idempotencyKey: REPROCESS_IDEMPOTENCY_KEY })),
    )

    expect(error).toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'Idempotency key cannot be reused',
      status: 409,
    })
    expect(JSON.stringify(error)).not.toContain(COMPANY_CONTEXT.companyId)
    expect(JSON.stringify(error)).not.toContain(REPROCESS_FINGERPRINT)
  })

  test('applies anti-enumeration for cross-tenant reprocess requests', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.batchItem = null
    unitOfWork.batch = { ...unitOfWork.batch, id: OTHER_BATCH_ID, companyId: 'company-002' }
    unitOfWork.batchItem = {
      id: OTHER_BATCH_ITEM_ID,
      batchId: OTHER_BATCH_ID,
      companyId: 'company-002',
      status: 'authorized',
    } as unknown as Record<string, unknown>
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    const error = await captureApiError(() =>
      useCase.reprocess(
        createReprocessInput({
          batchId: OTHER_BATCH_ID,
          batchItemId: OTHER_BATCH_ITEM_ID,
        }),
      ),
    )

    expect(error).toMatchObject({
      code: 'CTE_ISSUANCE_NOT_FOUND',
      message: 'CT-e issuance not found',
      status: 404,
    })
    expect(JSON.stringify(error)).not.toContain(BATCH_ID)
  })
})
