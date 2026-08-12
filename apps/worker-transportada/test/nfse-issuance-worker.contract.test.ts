/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { NfseIssuanceWorkerMessageHandler } from '../src/nfse-issuance/application/nfse-issuance-worker-message-handler.service.js'
import {
  NfseIssuanceFatalError,
  NfseIssuanceRecoverableError,
} from '../src/nfse-issuance/application/nfse-issuance.error.js'
import {
  createNfseRetryPolicy,
  calculateNfseRetryNextAttemptAt,
  isNfseRetryExhausted,
  NFSE_RETRY_DEFAULT_BACKOFF_SECONDS,
  NFSE_RETRY_DEFAULT_MAX_ATTEMPTS,
  NfseRetryPolicyInvalidError,
  resolveNfseRetryDelaySeconds,
} from '../src/nfse-issuance/domain/nfse-retry.policy.js'
import { NFSE_PROCESSING_EVENT_TYPE } from '../src/messaging/nfse-processing-envelope.schema.js'
import type { NfseProcessingEnvelopeV1 } from '../src/messaging/nfse-processing-envelope.schema.js'

const COMPANY_ID = '3b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e'
const INVOICE_ID = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d'
const ATTEMPT_ID = '6b7c8d9e-0f1a-4b2c-8d3e-4f5a6b7c8d9e'
const EVENT_ID = '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f'
const ACTOR_ID = '8d9e0f1a-2b3c-4d4e-8f5a-6b7c8d9e0f1a'

const NOW = new Date('2026-08-12T12:00:00.000Z')

const ENVELOPE: NfseProcessingEnvelopeV1 = {
  actorId: ACTOR_ID,
  companyId: COMPANY_ID,
  correlationId: 'corr-1',
  eventId: EVENT_ID,
  occurredAt: '2026-08-12T11:59:00.000Z',
  payload: {
    attemptFingerprint: 'fingerprint-1',
    attemptId: ATTEMPT_ID,
    attemptKind: 'issue',
    invoiceId: INVOICE_ID,
    status: 'requested',
  },
  type: NFSE_PROCESSING_EVENT_TYPE.INVOICE_ISSUE_REQUESTED,
  version: 1,
}

type HandlerFixture = {
  readonly calls: string[]
  readonly deadLettered: Record<string, unknown>[]
  readonly handler: NfseIssuanceWorkerMessageHandler
  readonly retries: Record<string, unknown>[]
}

function createHandlerFixture(options?: {
  readonly effect?: () => Promise<void>
  readonly hasProcessed?: boolean
  readonly policy?: { readonly backoffSeconds: readonly number[]; readonly maxAttempts: number }
}): HandlerFixture {
  const calls: string[] = []
  const deadLettered: Record<string, unknown>[] = []
  const retries: Record<string, unknown>[] = []

  const handler = new NfseIssuanceWorkerMessageHandler({
    clock: () => NOW,
    effect: {
      execute: async () => {
        calls.push('effect')
        await options?.effect?.()
      },
    },
    repository: {
      hasProcessed: async () => {
        calls.push('hasProcessed')
        return options?.hasProcessed ?? false
      },
      markDeadLettered: async (params) => {
        calls.push('markDeadLettered')
        deadLettered.push({ ...params })
      },
      markProcessed: async () => {
        calls.push('markProcessed')
      },
      scheduleRetry: async (params) => {
        calls.push('scheduleRetry')
        retries.push({ ...params })
      },
    },
    retryPolicyResolver: {
      resolve: async () => options?.policy ?? { backoffSeconds: [30, 120], maxAttempts: 3 },
    },
  })

  return { calls, deadLettered, handler, retries }
}

describe('NFS-e issuance worker handler contract', () => {
  test('checks the marker, runs the effect and only then marks the message processed', async () => {
    const fixture = createHandlerFixture()

    const result = await fixture.handler.handle({ attempt: 0, envelope: ENVELOPE })

    expect(result).toEqual({ type: 'ack' })
    expect(fixture.calls).toEqual(['hasProcessed', 'effect', 'markProcessed'])
  })

  test('a redelivered message acks without running the effect again', async () => {
    const fixture = createHandlerFixture({ hasProcessed: true })

    const result = await fixture.handler.handle({ attempt: 1, envelope: ENVELOPE })

    expect(result).toEqual({ type: 'ack' })
    expect(fixture.calls).toEqual(['hasProcessed'])
  })

  test('never marks the message processed when the effect fails', async () => {
    const fixture = createHandlerFixture({
      effect: async () => {
        throw new NfseIssuanceRecoverableError('transport_failure')
      },
    })

    await fixture.handler.handle({ attempt: 0, envelope: ENVELOPE })

    expect(fixture.calls).not.toContain('markProcessed')
  })

  test('schedules a retry with the delay of the company policy', async () => {
    const fixture = createHandlerFixture({
      effect: async () => {
        throw new NfseIssuanceRecoverableError('transport_failure')
      },
      policy: { backoffSeconds: [30, 120], maxAttempts: 3 },
    })

    const result = await fixture.handler.handle({ attempt: 0, envelope: ENVELOPE })

    expect(result).toEqual({ type: 'retry' })
    expect(fixture.retries).toEqual([
      {
        attemptId: ATTEMPT_ID,
        companyId: COMPANY_ID,
        eventId: EVENT_ID,
        invoiceId: INVOICE_ID,
        nextAttemptAt: new Date(NOW.getTime() + 30_000),
      },
    ])
  })

  test('dead-letters once the company policy is exhausted', async () => {
    const fixture = createHandlerFixture({
      effect: async () => {
        throw new NfseIssuanceRecoverableError('transport_failure')
      },
      policy: { backoffSeconds: [30], maxAttempts: 2 },
    })

    const result = await fixture.handler.handle({ attempt: 1, envelope: ENVELOPE })

    expect(result).toEqual({ type: 'dead-letter' })
    expect(fixture.deadLettered).toEqual([
      {
        attemptId: ATTEMPT_ID,
        companyId: COMPANY_ID,
        eventId: EVENT_ID,
        invoiceId: INVOICE_ID,
        reason: 'transport_failure',
      },
    ])
  })

  test('dead-letters a fatal failure without spending a retry', async () => {
    const fixture = createHandlerFixture({
      effect: async () => {
        throw new NfseIssuanceFatalError('rejected')
      },
    })

    const result = await fixture.handler.handle({ attempt: 0, envelope: ENVELOPE })

    expect(result).toEqual({ type: 'dead-letter' })
    expect(fixture.calls).not.toContain('scheduleRetry')
    expect(fixture.deadLettered.map((entry) => entry['reason'])).toEqual(['rejected'])
  })

  test('lets an unknown failure propagate instead of swallowing it', async () => {
    const fixture = createHandlerFixture({
      effect: async () => {
        throw new Error('boom')
      },
    })

    await expect(fixture.handler.handle({ attempt: 0, envelope: ENVELOPE })).rejects.toThrow('boom')
  })
})

describe('NFS-e retry policy contract', () => {
  test('falls back to the NFS-e defaults, which are not the SEFAZ ones', async () => {
    const policy = createNfseRetryPolicy({})

    expect(policy).toEqual({
      backoffSeconds: [...NFSE_RETRY_DEFAULT_BACKOFF_SECONDS],
      maxAttempts: NFSE_RETRY_DEFAULT_MAX_ATTEMPTS,
    })
    expect(policy.backoffSeconds[0]).toBeGreaterThanOrEqual(30)
  })

  test('honours the curve configured for the company', () => {
    const policy = createNfseRetryPolicy({ backoffSeconds: [10, 60], maxAttempts: 2 })

    expect(resolveNfseRetryDelaySeconds({ attemptsMade: 1, policy })).toBe(10)
    expect(resolveNfseRetryDelaySeconds({ attemptsMade: 2, policy })).toBe(60)
    expect(resolveNfseRetryDelaySeconds({ attemptsMade: 9, policy })).toBe(60)
    expect(calculateNfseRetryNextAttemptAt({ attemptsMade: 1, now: NOW, policy })).toEqual(
      new Date(NOW.getTime() + 10_000),
    )
    expect(isNfseRetryExhausted({ attemptsMade: 1, policy })).toBe(false)
    expect(isNfseRetryExhausted({ attemptsMade: 2, policy })).toBe(true)
  })

  test('refuses a configuration the operator cannot have meant', () => {
    expect(() => createNfseRetryPolicy({ maxAttempts: 0 })).toThrow(NfseRetryPolicyInvalidError)
    expect(() => createNfseRetryPolicy({ backoffSeconds: [] })).toThrow(NfseRetryPolicyInvalidError)
    expect(() => createNfseRetryPolicy({ backoffSeconds: [0] })).toThrow(
      NfseRetryPolicyInvalidError,
    )
  })
})
