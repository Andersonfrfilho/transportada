/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  CteIssuanceFatalError,
  CteIssuanceRecoverableError,
  CteIssuanceWorkerMessageHandler,
} from '../src/cte-issuance/application/cte-issuance-worker-message-handler.service.js'
import { createCteRetryPolicy } from '../src/cte-issuance/domain/cte-retry.policy.js'
import type { CteProcessingEnvelopeV1 } from '../src/messaging/cte-processing-envelope.schema.js'

const now = new Date('2026-07-22T21:00:00.000Z')
const defaultRetryPolicyResolver = {
  async resolve() {
    return createCteRetryPolicy({})
  },
}
const envelope: CteProcessingEnvelopeV1 = {
  actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
  companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
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

describe('CT-e issuance worker contract', () => {
  it('acks only after fiscal effect and persisted processed marker complete', async () => {
    const effect = createDeferred()
    const marker = createDeferred()
    const calls: string[] = []
    let settled = false
    const handler = new CteIssuanceWorkerMessageHandler({
      clock: { now: () => now },
      logger: silentLogger,
      effect: {
        async execute() {
          calls.push('effect.execute')
          await effect.promise
        },
      },
      retryPolicyResolver: defaultRetryPolicyResolver,
      repository: createRepository({
        calls,
        markProcessed: async () => {
          calls.push(`markProcessed:${cteMessageKey(envelope)}`)
          await marker.promise
        },
      }),
    })

    const handling = handler.handle({ attempt: 0, envelope }).then((disposition) => {
      settled = true
      return disposition
    })

    await Bun.sleep(0)
    expect(calls).toEqual([`hasProcessed:${cteMessageKey(envelope)}`, 'effect.execute'])
    expect(settled).toBe(false)

    effect.resolve()
    await Bun.sleep(0)
    expect(calls).toEqual([
      `hasProcessed:${cteMessageKey(envelope)}`,
      'effect.execute',
      `markProcessed:${cteMessageKey(envelope)}`,
    ])
    expect(settled).toBe(false)

    marker.resolve()
    await expect(handling).resolves.toEqual({ type: 'ack' })
  })

  it('acks redelivery without duplicating the CT-e effect for the same item attempt', async () => {
    const calls: string[] = []
    const handler = new CteIssuanceWorkerMessageHandler({
      clock: { now: () => now },
      logger: silentLogger,
      effect: {
        async execute() {
          calls.push('effect.execute')
        },
      },
      retryPolicyResolver: defaultRetryPolicyResolver,
      repository: createRepository({
        calls,
        processedKeys: new Set([cteMessageKey(envelope)]),
      }),
    })

    await expect(handler.handle({ attempt: 1, envelope })).resolves.toEqual({ type: 'ack' })

    expect(calls).toEqual([`hasProcessed:${cteMessageKey(envelope)}`])
  })

  it('persists backoff before returning retry for recoverable errors', async () => {
    const calls: string[] = []
    const handler = new CteIssuanceWorkerMessageHandler({
      clock: { now: () => now },
      logger: silentLogger,
      effect: {
        async execute() {
          calls.push('effect.execute')
          throw new CteIssuanceRecoverableError('sefaz timeout')
        },
      },
      retryPolicyResolver: defaultRetryPolicyResolver,
      repository: createRepository({ calls }),
    })

    await expect(handler.handle({ attempt: 1, envelope })).resolves.toEqual({ type: 'retry' })

    expect(calls).toEqual([
      `hasProcessed:${cteMessageKey(envelope)}`,
      'effect.execute',
      `scheduleRetry:${cteMessageKey(envelope)}:2:2026-07-22T21:00:30.000Z`,
    ])
  })

  it('dead-letters after the finite retry limit is reached', async () => {
    const calls: string[] = []
    const handler = new CteIssuanceWorkerMessageHandler({
      clock: { now: () => now },
      logger: silentLogger,
      effect: {
        async execute() {
          calls.push('effect.execute')
          throw new CteIssuanceRecoverableError('sefaz unavailable')
        },
      },
      retryPolicyResolver: defaultRetryPolicyResolver,
      repository: createRepository({ calls }),
    })

    await expect(handler.handle({ attempt: 3, envelope })).resolves.toEqual({ type: 'dead-letter' })

    expect(calls).toEqual([
      `hasProcessed:${cteMessageKey(envelope)}`,
      'effect.execute',
      `markDeadLettered:${cteMessageKey(envelope)}:sefaz unavailable`,
    ])
  })

  it('isolates idempotency by company, item and attempt instead of event alone', async () => {
    const calls: string[] = []
    const otherCompanyEnvelope: CteProcessingEnvelopeV1 = {
      ...envelope,
      companyId: '00000000-0000-4000-8000-000000000001',
    }
    const handler = new CteIssuanceWorkerMessageHandler({
      clock: { now: () => now },
      logger: silentLogger,
      effect: {
        async execute(params) {
          calls.push(`effect.execute:${params.envelope.companyId}`)
        },
      },
      retryPolicyResolver: defaultRetryPolicyResolver,
      repository: createRepository({
        calls,
        processedKeys: new Set([cteMessageKey(envelope)]),
      }),
    })

    await expect(handler.handle({ attempt: 0, envelope: otherCompanyEnvelope })).resolves.toEqual({
      type: 'ack',
    })

    expect(calls).toEqual([
      `hasProcessed:${cteMessageKey(otherCompanyEnvelope)}`,
      `effect.execute:${otherCompanyEnvelope.companyId}`,
      `markProcessed:${cteMessageKey(otherCompanyEnvelope)}`,
    ])
  })

  it('routes permanent fiscal failures directly to DLQ', async () => {
    const calls: string[] = []
    const handler = new CteIssuanceWorkerMessageHandler({
      clock: { now: () => now },
      logger: silentLogger,
      effect: {
        async execute() {
          calls.push('effect.execute')
          throw new CteIssuanceFatalError('cte rejected')
        },
      },
      retryPolicyResolver: defaultRetryPolicyResolver,
      repository: createRepository({ calls }),
    })

    await expect(handler.handle({ attempt: 0, envelope })).resolves.toEqual({ type: 'dead-letter' })

    expect(calls).toEqual([
      `hasProcessed:${cteMessageKey(envelope)}`,
      'effect.execute',
      `markDeadLettered:${cteMessageKey(envelope)}:cte rejected`,
    ])
  })
})

function createRepository(params: {
  readonly calls: string[]
  readonly markProcessed?: () => Promise<void>
  readonly processedKeys?: ReadonlySet<string>
}) {
  return {
    async hasProcessed(input: {
      readonly attemptId: string
      readonly batchItemId: string
      readonly companyId: string
      readonly eventId: string
    }): Promise<boolean> {
      const key = cteMessageKey(input)
      params.calls.push(`hasProcessed:${key}`)

      return params.processedKeys?.has(key) ?? false
    },
    async markDeadLettered(input: {
      readonly attemptId: string
      readonly batchItemId: string
      readonly companyId: string
      readonly eventId: string
      readonly reason: string
    }): Promise<void> {
      params.calls.push(`markDeadLettered:${cteMessageKey(input)}:${input.reason}`)
    },
    async markReconciliationRequired(input: {
      readonly attemptId: string
      readonly batchItemId: string
      readonly companyId: string
      readonly eventId: string
      readonly reason: string
    }): Promise<void> {
      params.calls.push(`markReconciliationRequired:${cteMessageKey(input)}:${input.reason}`)
    },
    async markProcessed(input: {
      readonly attemptId: string
      readonly batchItemId: string
      readonly companyId: string
      readonly eventId: string
    }): Promise<void> {
      if (params.markProcessed) {
        await params.markProcessed()
        return
      }

      params.calls.push(`markProcessed:${cteMessageKey(input)}`)
    },
    async scheduleRetry(input: {
      readonly attempt: number
      readonly attemptId: string
      readonly batchItemId: string
      readonly companyId: string
      readonly eventId: string
      readonly nextAttemptAt: Date
    }): Promise<void> {
      params.calls.push(
        `scheduleRetry:${cteMessageKey(input)}:${input.attempt}:${input.nextAttemptAt.toISOString()}`,
      )
    },
  }
}

function cteMessageKey(
  input:
    | CteProcessingEnvelopeV1
    | {
        readonly attemptId: string
        readonly batchItemId: string
        readonly companyId: string
        readonly eventId: string
      },
): string {
  if ('payload' in input) {
    return `${input.companyId}:${input.payload.batchItemId}:${input.payload.attemptId}:${input.eventId}`
  }

  return `${input.companyId}:${input.batchItemId}:${input.attemptId}:${input.eventId}`
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve() {
      if (!resolvePromise) {
        throw new Error('Deferred resolver is unavailable')
      }
      resolvePromise()
    },
  }
}

const silentLogger = {
  error() {},
  info() {},
  warn() {},
}
