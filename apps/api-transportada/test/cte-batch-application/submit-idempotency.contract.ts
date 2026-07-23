import { describe, expect, test } from 'bun:test'

import {
  BATCH_ID,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  EXPECTED_BATCH_SUMMARY,
  SUBMISSION_FINGERPRINT,
  SUBMISSION_IDEMPOTENCY_KEY,
  captureApiError,
  createCteBatchUseCaseForTest,
  CteBatchUnitOfWorkFixture,
} from './support.js'

describe('CT-e batch application submit contract', () => {
  test('submits a draft batch once and records idempotency before external effects', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    const useCase = await createCteBatchUseCaseForTest(unitOfWork, SUBMISSION_FINGERPRINT)

    const result = await useCase.submit({
      batchId: BATCH_ID,
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      idempotencyKey: SUBMISSION_IDEMPOTENCY_KEY,
    })

    expect(result).toEqual({
      ...EXPECTED_BATCH_SUMMARY,
      status: 'submitted',
      version: '2',
    })
    expect(unitOfWork.executedTransactions).toEqual(['cte-batch'])
    expect(unitOfWork.createdSubmissionRecords).toEqual([
      {
        batchId: BATCH_ID,
        companyId: COMPANY_CONTEXT.companyId,
        idempotencyKey: SUBMISSION_IDEMPOTENCY_KEY,
        requestFingerprint: SUBMISSION_FINGERPRINT,
        result: null,
        submissionStatus: 'pending',
      },
    ])
    expect(unitOfWork.statusChanges).toEqual([
      {
        batchId: BATCH_ID,
        companyId: COMPANY_CONTEXT.companyId,
        expectedStatus: 'draft',
        nextStatus: 'submitted',
      },
    ])
    expect(unitOfWork.createdEvents).toContainEqual({
      batchId: BATCH_ID,
      companyId: COMPANY_CONTEXT.companyId,
      eventName: 'submitted',
      payload: {
        previousStatus: 'draft',
        status: 'submitted',
      },
      userId: COMPANY_CONTEXT.userId,
    })
  })

  test('replays matching submit idempotency without creating another transition', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    unitOfWork.replayedSubmission = {
      batch: {
        ...EXPECTED_BATCH_SUMMARY,
        status: 'submitted',
        version: '2',
      },
      requestFingerprint: SUBMISSION_FINGERPRINT,
    }
    const useCase = await createCteBatchUseCaseForTest(unitOfWork, SUBMISSION_FINGERPRINT)

    const result = await useCase.submit({
      batchId: BATCH_ID,
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      idempotencyKey: SUBMISSION_IDEMPOTENCY_KEY,
    })

    expect(result).toEqual({
      ...EXPECTED_BATCH_SUMMARY,
      status: 'submitted',
      version: '2',
    })
    expect(unitOfWork.createdSubmissionRecords).toEqual([])
    expect(unitOfWork.statusChanges).toEqual([])
    expect(unitOfWork.createdEvents).toEqual([])
  })

  test('rejects divergent submit idempotency safely', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    unitOfWork.replayedSubmission = {
      batch: EXPECTED_BATCH_SUMMARY,
      requestFingerprint: 'another-fingerprint',
    }
    const useCase = await createCteBatchUseCaseForTest(unitOfWork, SUBMISSION_FINGERPRINT)

    const error = await captureApiError(() =>
      useCase.submit({
        batchId: BATCH_ID,
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        idempotencyKey: SUBMISSION_IDEMPOTENCY_KEY,
      }),
    )

    expect(error).toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'Idempotency key cannot be reused',
      status: 409,
    })
    expect(JSON.stringify(error)).not.toContain(COMPANY_CONTEXT.companyId)
    expect(JSON.stringify(error)).not.toContain(SUBMISSION_FINGERPRINT)
  })
})
