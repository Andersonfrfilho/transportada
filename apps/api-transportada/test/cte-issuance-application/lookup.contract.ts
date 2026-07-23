/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  BATCH_ID,
  BATCH_ITEM_ID,
  COMPANY_CONTEXT,
  OTHER_BATCH_ID,
  OTHER_BATCH_ITEM_ID,
  createCteIssuanceUseCaseForTest,
  CteIssuanceUnitOfWorkFixture,
  captureApiError,
} from './support.js'
import type { CteIssuanceUseCaseContract } from './support.js'

describe('CT-e issuance lookup contract', () => {
  test('returns rejected classification with sanitized metadata', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.issuanceResult = unitOfWork.rejectedIssuance
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    const result = await useCase.getIssuance({
      batchItemId: BATCH_ITEM_ID,
      batchId: BATCH_ID,
      context: COMPANY_CONTEXT,
      includeRejected: true,
    } as const)

    const normalizedResult = result as {
      readonly context: {
        readonly status: string
        readonly reasonCode: string
        readonly reasonCause: string
      }
      readonly accessKey?: string
      readonly protocol?: string
    }
    expect(normalizedResult.context).toMatchObject({
      status: 'rejected',
      reasonCode: 'FISCAL_REJECTION',
      reasonCause: 'Rejected by SEFAZ',
    })
    expect(normalizedResult.accessKey).toBeUndefined()
    expect(normalizedResult.protocol).toBeUndefined()
  })

  test('returns retry state and next-attempt metadata without leaking XML-like secrets', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.issuanceResult = unitOfWork.retryIssuance
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    const result = await useCase.getIssuance({
      batchItemId: BATCH_ITEM_ID,
      batchId: BATCH_ID,
      context: COMPANY_CONTEXT,
      includeRetry: true,
    } as const)

    const normalizedResult = result as {
      readonly context: { readonly status: string; readonly reasonCode: string }
      readonly issueRequestedAt?: string
    }
    expect(normalizedResult.context).toMatchObject({
      status: 'retry_scheduled',
      reasonCode: 'TECHNICAL_TIMEOUT',
    })
    expect(normalizedResult.issueRequestedAt).toBe('2026-07-22T20:00:00.000Z')
    expect(JSON.stringify(result)).not.toContain('xml')
    expect(JSON.stringify(result)).not.toContain('certificate')
  })

  test('returns failed terminal classification as non-retryable', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.issuanceResult = unitOfWork.failedIssuance
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    const result = await useCase.getIssuance({
      batchItemId: BATCH_ITEM_ID,
      batchId: BATCH_ID,
      context: COMPANY_CONTEXT,
      includeFailed: true,
    } as const)

    const normalizedResult = result as {
      readonly context: { readonly status: string; readonly reasonCode: string }
    }
    expect(normalizedResult.context).toMatchObject({
      status: 'failed',
      reasonCode: 'UNRECOVERABLE',
    })
  })

  test('keeps anti-enumeration for cross-tenant lookup', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.batch = {
      ...unitOfWork.batch,
      companyId: 'other-company',
      id: OTHER_BATCH_ID,
    } as Record<string, unknown>
    unitOfWork.batchItem = {
      companyId: 'other-company',
      batchId: OTHER_BATCH_ID,
      id: OTHER_BATCH_ITEM_ID,
      status: 'authorized',
    } as Record<string, unknown>

    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    const error = await captureApiError(() =>
      useCase.getIssuance({
        batchItemId: OTHER_BATCH_ITEM_ID,
        batchId: OTHER_BATCH_ID,
        context: COMPANY_CONTEXT,
      }),
    )

    expect(error).toMatchObject({
      code: 'CTE_ISSUANCE_NOT_FOUND',
      message: 'CT-e issuance not found',
      status: 404,
    })
    expect(JSON.stringify(error)).not.toContain(OTHER_BATCH_ID)
  })
})
