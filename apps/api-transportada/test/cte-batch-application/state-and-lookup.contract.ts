import { describe, expect, test } from 'bun:test'

import {
  BATCH_ID,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  EXPECTED_BATCH_SUMMARY,
  CteBatchUnitOfWorkFixture,
  captureApiError,
  createCteBatchUseCaseForTest,
} from './support.js'
import type { CteBatchStatus } from './support.js'

describe('CT-e batch application state and lookup contract', () => {
  test('allows explicit finite state transitions and records the timeline', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    unitOfWork.batch = {
      ...EXPECTED_BATCH_SUMMARY,
      status: 'submitted',
    }
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    await useCase.transition({
      batchId: BATCH_ID,
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      nextStatus: 'in_flight',
    })

    expect(unitOfWork.executedTransactions).toEqual(['cte-batch'])
    expect(unitOfWork.statusChanges).toEqual([
      {
        batchId: BATCH_ID,
        companyId: COMPANY_CONTEXT.companyId,
        expectedStatus: 'submitted',
        nextStatus: 'in_flight',
      },
    ])
    expect(unitOfWork.createdEvents).toContainEqual({
      batchId: BATCH_ID,
      companyId: COMPANY_CONTEXT.companyId,
      eventName: 'in_flight',
      payload: {
        previousStatus: 'submitted',
        status: 'in_flight',
      },
      userId: COMPANY_CONTEXT.userId,
    })
  })

  test('rejects invalid cancellation and transition attempts without mutating state', async () => {
    const scenarios: ReadonlyArray<{
      readonly currentStatus: CteBatchStatus
      readonly operation: 'cancel' | 'transition'
    }> = [
      { currentStatus: 'done', operation: 'cancel' },
      { currentStatus: 'draft', operation: 'transition' },
      { currentStatus: 'cancelled', operation: 'transition' },
    ]

    for (const scenario of scenarios) {
      const unitOfWork = new CteBatchUnitOfWorkFixture()
      unitOfWork.batch = {
        ...EXPECTED_BATCH_SUMMARY,
        status: scenario.currentStatus,
      }
      const useCase = await createCteBatchUseCaseForTest(unitOfWork)
      const action =
        scenario.operation === 'cancel'
          ? () =>
              useCase.cancel({
                batchId: BATCH_ID,
                context: COMPANY_CONTEXT,
                correlationId: CORRELATION_ID,
              })
          : () =>
              useCase.transition({
                batchId: BATCH_ID,
                context: COMPANY_CONTEXT,
                correlationId: CORRELATION_ID,
                nextStatus: 'done',
              })

      const error = await captureApiError(action)

      expect(error).toMatchObject({
        code: 'CTE_BATCH_INVALID_STATE',
        message: 'CT-e batch state transition is not allowed',
        status: 409,
      })
      expect(unitOfWork.statusChanges).toEqual([])
      expect(unitOfWork.createdEvents).toEqual([])
    }
  })

  test('uses anti-enumeration for missing and cross-tenant batch lookups', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    unitOfWork.batch = null
    const useCase = await createCteBatchUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.get({
        batchId: BATCH_ID,
        context: COMPANY_CONTEXT,
      }),
    )

    expect(error).toMatchObject({
      code: 'CTE_BATCH_NOT_FOUND',
      message: 'CT-e batch was not found',
      status: 404,
    })
    expect(JSON.stringify(error)).not.toContain(BATCH_ID)
    expect(unitOfWork.batchQueries).toEqual([
      {
        batchId: BATCH_ID,
        companyId: COMPANY_CONTEXT.companyId,
      },
    ])
  })
})
