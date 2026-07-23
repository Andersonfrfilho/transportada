/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  BATCH_ID,
  BATCH_ITEM_ID,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  IDEMPOTENCY_KEY,
  ISSUE_FINGERPRINT,
  ISSUE_COMMAND_RESULT,
  createCteIssuanceUseCaseForTest,
  captureApiError,
  CteIssuanceUnitOfWorkFixture,
} from './support.js'
import type { CteIssuanceIssueInput, CteIssuanceUseCaseContract } from './support.js'

function createIssueInput(overrides: Partial<CteIssuanceIssueInput> = {}): CteIssuanceIssueInput {
  return {
    context: COMPANY_CONTEXT,
    correlationId: CORRELATION_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    batchId: BATCH_ID,
    ...overrides,
  }
}

describe('CT-e issuance application issue contract', () => {
  test('schedules issue attempts with retry-capable metadata in tenant scope', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    const result = (await useCase.issue(createIssueInput())) as { readonly attemptId: string }

    expect(result).toMatchObject({
      attemptId: ISSUE_COMMAND_RESULT.attemptId,
      attemptKind: ISSUE_COMMAND_RESULT.attemptKind,
      attemptNumber: ISSUE_COMMAND_RESULT.attemptNumber,
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      companyId: COMPANY_CONTEXT.companyId,
      fiscalEnvironment: 'homologation',
      fiscalSeries: '1',
      fiscalNumber: '100000001',
      idempotencyKey: IDEMPOTENCY_KEY,
      status: 'requested',
    })
    expect(unitOfWork.executedTransactions).toEqual(['cte-issuance'])
    expect(unitOfWork.batchQueries).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, batchId: BATCH_ID },
    ])
    expect(unitOfWork.batchItemQueries).toEqual([
      { batchId: BATCH_ID, companyId: COMPANY_CONTEXT.companyId },
    ])
    expect(unitOfWork.issueIdempotencyQueries).toHaveLength(1)
    expect(unitOfWork.commandOutbox).toHaveLength(1)
    expect(unitOfWork.events).toHaveLength(1)
    expect(JSON.stringify(unitOfWork.events)).not.toContain('xml')
    expect(JSON.stringify(unitOfWork.commandOutbox)).not.toContain('certificate')
  })

  test('replays issue idempotency when fingerprint matches', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.issueReplay = {
      requestFingerprint: ISSUE_FINGERPRINT,
      response: ISSUE_COMMAND_RESULT,
    }
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    const result = (await useCase.issue(createIssueInput())) as { readonly attemptId: string }

    expect(result).toEqual(ISSUE_COMMAND_RESULT)
    expect(unitOfWork.commandOutbox).toEqual([])
    expect(unitOfWork.attempts).toEqual([])
    expect(unitOfWork.batchQueries).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, batchId: BATCH_ID },
    ])
    expect(unitOfWork.batchItemQueries).toEqual([])
  })

  test('rejects divergent issue idempotency fingerprints safely', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.issueReplay = {
      requestFingerprint: 'another-fingerprint',
      response: ISSUE_COMMAND_RESULT,
    }
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    const error = await captureApiError(() => useCase.issue(createIssueInput()))

    expect(error).toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'Idempotency key cannot be reused',
      status: 409,
    })
    expect(JSON.stringify(error)).not.toContain(COMPANY_CONTEXT.companyId)
    expect(JSON.stringify(error)).not.toContain(ISSUE_FINGERPRINT)
    expect(unitOfWork.commandOutbox).toEqual([])
    expect(unitOfWork.attempts).toEqual([])
  })

  test('replays retry scheduling for recoverable temporary failures', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.issuanceResult = unitOfWork.retryIssuance
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    const result = (await useCase.issue(createIssueInput())) as { readonly attemptId: string }

    expect(result).toMatchObject({
      context: {
        status: 'retry_scheduled',
        reasonCode: 'TECHNICAL_TIMEOUT',
      },
      batchId: BATCH_ID,
      companyId: COMPANY_CONTEXT.companyId,
    })
    expect(unitOfWork.commandOutbox).toHaveLength(1)
    expect(unitOfWork.retries).toHaveLength(1)
    expect(unitOfWork.retries[0]).toMatchObject({
      batchItemId: BATCH_ITEM_ID,
      batchId: BATCH_ID,
      status: 'scheduled',
      attemptId: result.attemptId as string,
    })
  })

  test('records safe rejected state without exposing XML-like data', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.issuanceResult = unitOfWork.rejectedIssuance
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    const result = await useCase.getIssuance({
      batchItemId: BATCH_ITEM_ID,
      batchId: BATCH_ID,
      context: COMPANY_CONTEXT,
    })

    const normalizedResult = result as {
      readonly context: {
        readonly status: string
        readonly reasonCode: string
      }
    }
    expect(normalizedResult.context.status).toBe('rejected')
    expect(normalizedResult.context.reasonCode).toBe('FISCAL_REJECTION')
    expect(JSON.stringify(result)).not.toContain('xml')
    expect(JSON.stringify(result)).not.toContain('protocol')
    expect(JSON.stringify(result)).not.toContain('raw')
  })

  test('returns anti-enumeration not-found for missing batch items', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.batchItem = null
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    const error = await captureApiError(() =>
      useCase.getIssuance({
        batchItemId: BATCH_ITEM_ID,
        batchId: BATCH_ID,
        context: COMPANY_CONTEXT,
      }),
    )

    expect(error).toMatchObject({
      code: 'CTE_ISSUANCE_NOT_FOUND',
      message: 'CT-e issuance not found',
      status: 404,
    })
    expect(JSON.stringify(error)).not.toContain(BATCH_ID)
  })
})
