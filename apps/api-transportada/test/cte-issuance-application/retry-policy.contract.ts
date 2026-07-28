/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createCteRetryPolicy } from '../../src/cte-issuance/domain/cte-retry.policy.js'

import {
  BATCH_ID,
  BATCH_ITEM_ID,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  CteIssuanceUnitOfWorkFixture,
  IDEMPOTENCY_KEY,
  createCteIssuanceUseCaseForTest,
  type CteIssuanceUseCaseContract,
} from './support.js'

function createIssueInput() {
  return {
    batchId: BATCH_ID,
    context: COMPANY_CONTEXT,
    correlationId: CORRELATION_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
  }
}

async function scheduleRetryWith(policy: {
  readonly backoffSeconds: readonly number[]
  readonly maxAttempts: number
}): Promise<Record<string, unknown>> {
  const unitOfWork = new CteIssuanceUnitOfWorkFixture()
  unitOfWork.issuanceResult = unitOfWork.retryIssuance
  unitOfWork.fiscalSettings = {
    environment: 'homologation',
    retryPolicy: createCteRetryPolicy(policy),
    series: '1',
  }
  const useCase = (await createCteIssuanceUseCaseForTest(unitOfWork)) as CteIssuanceUseCaseContract

  await useCase.issue(createIssueInput())

  expect(unitOfWork.retries).toHaveLength(1)
  const [retry] = unitOfWork.retries
  if (retry === undefined) throw new Error('Expected a scheduled retry')
  return retry
}

describe('CT-e retry scheduling honours the company policy', () => {
  test('persists the configured attempt ceiling instead of the hardcoded three', async () => {
    const retry = await scheduleRetryWith({ backoffSeconds: [45], maxAttempts: 7 })

    expect(retry).toMatchObject({
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      companyId: COMPANY_CONTEXT.companyId,
      maxAttempts: 7,
      status: 'scheduled',
    })
  })

  test('projects the next attempt from the configured backoff instead of ten seconds', async () => {
    const before = Date.now()
    const retry = await scheduleRetryWith({ backoffSeconds: [45], maxAttempts: 7 })
    const nextAttemptAt = new Date(retry['nextAttemptAt'] as string).getTime()

    expect(Number.isNaN(nextAttemptAt)).toBeFalse()
    expect(nextAttemptAt).toBeGreaterThanOrEqual(before + 45_000)
    expect(nextAttemptAt).toBeLessThan(before + 50_000)
  })

  test('marks the schedule as exhausted once the configured attempts are consumed', async () => {
    const retry = await scheduleRetryWith({ backoffSeconds: [45], maxAttempts: 1 })

    expect(retry).toMatchObject({ maxAttempts: 1, status: 'exhausted' })
    expect(Number(retry['attemptCount'])).toBeGreaterThanOrEqual(1)
  })

  test('reads the retry policy from the authenticated company settings', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.issuanceResult = unitOfWork.retryIssuance
    const useCase = (await createCteIssuanceUseCaseForTest(
      unitOfWork,
    )) as CteIssuanceUseCaseContract

    await useCase.issue(createIssueInput())

    expect(unitOfWork.fiscalSettingsQueries).toContainEqual({
      companyId: COMPANY_CONTEXT.companyId,
    })
    expect(unitOfWork.retries[0]).toMatchObject({ companyId: COMPANY_CONTEXT.companyId })
  })
})
