/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  CteIssuanceRecoverableError,
  CteIssuanceWorkerMessageHandler,
} from '../src/cte-issuance/application/cte-issuance-worker-message-handler.service.js'
import {
  CTE_RETRY_DEFAULT_BACKOFF_SECONDS,
  CTE_RETRY_DEFAULT_MAX_ATTEMPTS,
  createCteRetryPolicy,
  type CteRetryPolicy,
} from '../src/cte-issuance/domain/cte-retry.policy.js'
import type { CteProcessingEnvelopeV1 } from '../src/messaging/cte-processing-envelope.schema.js'

const now = new Date('2026-07-22T21:00:00.000Z')
const COMPANY_ID = 'fbc033e7-63e0-4698-adc6-12778bedf4a7'

const envelope: CteProcessingEnvelopeV1 = {
  actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
  companyId: COMPANY_ID,
  correlationId: 'contract-test-correlation',
  eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
  occurredAt: '2026-07-22T20:00:00.000Z',
  payload: {
    attemptFingerprint: 'ctefingerprint-001',
    attemptId: '4f6f2e89-bf9b-4d16-b7e7-d8ce6b0f6f5d',
    attemptKind: 'issue',
    batchId: 'd2f4ef6d-4f5d-45af-a9b0-bf4e0f8f8d4d',
    batchItemId: '8a7d8b98-ff3e-4f5f-9967-57fdb2e7e2d8',
    status: 'requested',
  },
  type: 'transportada.cte.item.issue.requested',
  version: 1,
}

describe('CT-e issuance worker retry policy contract', () => {
  it('uses the backoff configured by the company instead of the shipped curve', async () => {
    const scenario = createScenario({ backoffSeconds: [120, 600], maxAttempts: 5 })

    await expect(scenario.handler.handle({ attempt: 1, envelope })).resolves.toEqual({
      type: 'retry',
    })

    expect(scenario.resolvedCompanyIds).toEqual([COMPANY_ID])
    expect(scenario.retries).toEqual([{ attempt: 2, nextAttemptAt: '2026-07-22T21:10:00.000Z' }])
  })

  it('dead-letters exactly at the company attempt ceiling', async () => {
    const scenario = createScenario({ backoffSeconds: [120, 600], maxAttempts: 2 })

    await expect(scenario.handler.handle({ attempt: 1, envelope })).resolves.toEqual({
      type: 'dead-letter',
    })

    expect(scenario.retries).toEqual([])
    expect(scenario.deadLetters).toEqual(['sefaz timeout'])
  })

  it('retries below the ceiling with the configured curve', async () => {
    const scenario = createScenario({ backoffSeconds: [120, 600], maxAttempts: 2 })

    await expect(scenario.handler.handle({ attempt: 0, envelope })).resolves.toEqual({
      type: 'retry',
    })

    expect(scenario.retries).toEqual([{ attempt: 1, nextAttemptAt: '2026-07-22T21:02:00.000Z' }])
  })

  it('falls back to the shipped defaults when the company has no configuration', async () => {
    const scenario = createScenario(null)

    await expect(scenario.handler.handle({ attempt: 0, envelope })).resolves.toEqual({
      type: 'retry',
    })

    const [firstStep] = CTE_RETRY_DEFAULT_BACKOFF_SECONDS
    expect(CTE_RETRY_DEFAULT_MAX_ATTEMPTS).toBe(3)
    expect(scenario.retries).toEqual([
      {
        attempt: 1,
        nextAttemptAt: new Date(now.getTime() + (firstStep ?? 0) * 1_000).toISOString(),
      },
    ])
  })
})

type Scenario = {
  readonly deadLetters: string[]
  readonly handler: CteIssuanceWorkerMessageHandler
  readonly resolvedCompanyIds: string[]
  readonly retries: Array<{ readonly attempt: number; readonly nextAttemptAt: string }>
}

function createScenario(
  policyInput: { readonly backoffSeconds: readonly number[]; readonly maxAttempts: number } | null,
): Scenario {
  const deadLetters: string[] = []
  const resolvedCompanyIds: string[] = []
  const retries: Array<{ readonly attempt: number; readonly nextAttemptAt: string }> = []
  const policy: CteRetryPolicy = createCteRetryPolicy(policyInput ?? {})

  const handler = new CteIssuanceWorkerMessageHandler({
    clock: { now: () => now },
    logger: { error: () => {}, info: () => {}, warn: () => {} },
    effect: {
      async execute() {
        throw new CteIssuanceRecoverableError('sefaz timeout')
      },
    },
    retryPolicyResolver: {
      async resolve(params: { readonly companyId: string }): Promise<CteRetryPolicy> {
        resolvedCompanyIds.push(params.companyId)
        return policy
      },
    },
    repository: {
      async hasProcessed(): Promise<boolean> {
        return false
      },
      async markDeadLettered(input: { readonly reason: string }): Promise<void> {
        deadLetters.push(input.reason)
      },
      async markProcessed(): Promise<void> {},
      async markReconciliationRequired(): Promise<void> {},
      async scheduleRetry(input: {
        readonly attempt: number
        readonly nextAttemptAt: Date
      }): Promise<void> {
        retries.push({ attempt: input.attempt, nextAttemptAt: input.nextAttemptAt.toISOString() })
      },
    },
  })

  return { deadLetters, handler, resolvedCompanyIds, retries }
}
