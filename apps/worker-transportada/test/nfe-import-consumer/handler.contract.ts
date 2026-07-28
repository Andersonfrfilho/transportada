/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  NfeImportFatalError,
  NfeImportRecoverableError,
  NfeImportWorkerMessageHandler,
} from '../../src/nfe-imports/application/nfe-import-worker-message-handler.service.js'
import type { NfeProcessingEnvelopeV1 } from '../../src/messaging/nfe-processing-envelope.schema.js'

const now = new Date('2026-07-22T21:00:00.000Z')
const envelope: NfeProcessingEnvelopeV1 = {
  actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
  companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
  correlationId: 'contract-test-correlation',
  eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
  occurredAt: '2026-07-22T20:00:00.000Z',
  payload: {
    importId: '8a7d8b98-ff3e-4f5f-9967-57fdb2e7e2d8',
  },
  type: 'transportada.nfe.import.requested',
  version: 1,
}

describe('NF-e import worker contract', () => {
  it('acks only after import effect and persisted processed marker complete', async () => {
    const effect = createDeferred()
    const marker = createDeferred()
    const calls: string[] = []
    let settled = false
    const handler = new NfeImportWorkerMessageHandler({
      clock: { now: () => now },
      effect: {
        async execute() {
          calls.push('effect.execute')
          await effect.promise
          return undefined
        },
      },
      maxAttempts: 3,
      repository: createRepository({
        calls,
        markProcessed: async () => {
          calls.push(`markProcessed:${nfeMessageKey(envelope)}`)
          await marker.promise
        },
      }),
    })

    const handling = handler.handle({ attempt: 0, envelope }).then((disposition) => {
      settled = true
      return disposition
    })

    await Bun.sleep(0)
    expect(calls).toEqual([`hasProcessed:${nfeMessageKey(envelope)}`, 'effect.execute'])
    expect(settled).toBe(false)

    effect.resolve()
    await Bun.sleep(0)
    expect(calls).toEqual([
      `hasProcessed:${nfeMessageKey(envelope)}`,
      'effect.execute',
      `markProcessed:${nfeMessageKey(envelope)}`,
    ])
    expect(settled).toBe(false)

    marker.resolve()
    await expect(handling).resolves.toEqual({ type: 'ack' })
  })

  it('acks redelivery without duplicating the import effect for the same event', async () => {
    const calls: string[] = []
    const handler = new NfeImportWorkerMessageHandler({
      clock: { now: () => now },
      effect: {
        async execute() {
          calls.push('effect.execute')
          return undefined
        },
      },
      maxAttempts: 3,
      repository: createRepository({
        calls,
        processedKeys: new Set([nfeMessageKey(envelope)]),
      }),
    })

    await expect(handler.handle({ attempt: 1, envelope })).resolves.toEqual({ type: 'ack' })

    expect(calls).toEqual([`hasProcessed:${nfeMessageKey(envelope)}`])
  })

  it('persists backoff before returning retry for recoverable errors', async () => {
    const calls: string[] = []
    const handler = new NfeImportWorkerMessageHandler({
      clock: { now: () => now },
      effect: {
        async execute() {
          calls.push('effect.execute')
          throw new NfeImportRecoverableError('storage timeout')
        },
      },
      maxAttempts: 3,
      repository: createRepository({ calls }),
    })

    await expect(handler.handle({ attempt: 1, envelope })).resolves.toEqual({ type: 'retry' })

    expect(calls).toEqual([
      `hasProcessed:${nfeMessageKey(envelope)}`,
      'effect.execute',
      `scheduleRetry:${nfeMessageKey(envelope)}:2:2026-07-22T21:00:30.000Z`,
    ])
  })

  it('treats an unclassified effect failure as recoverable and schedules backoff', async () => {
    const calls: string[] = []
    const handler = new NfeImportWorkerMessageHandler({
      clock: { now: () => now },
      effect: {
        async execute() {
          calls.push('effect.execute')
          throw new Error('NF-e import not found for worker consumption')
        },
      },
      maxAttempts: 3,
      repository: createRepository({ calls }),
    })

    await expect(handler.handle({ attempt: 0, envelope })).resolves.toEqual({ type: 'retry' })

    expect(calls).toEqual([
      `hasProcessed:${nfeMessageKey(envelope)}`,
      'effect.execute',
      `scheduleRetry:${nfeMessageKey(envelope)}:1:2026-07-22T21:00:05.000Z`,
    ])
  })

  it('dead-letters after the finite retry limit is reached', async () => {
    const calls: string[] = []
    const handler = new NfeImportWorkerMessageHandler({
      clock: { now: () => now },
      effect: {
        async execute() {
          calls.push('effect.execute')
          throw new NfeImportRecoverableError('storage unavailable')
        },
      },
      maxAttempts: 3,
      repository: createRepository({ calls }),
    })

    await expect(handler.handle({ attempt: 3, envelope })).resolves.toEqual({ type: 'dead-letter' })

    expect(calls).toEqual([
      `hasProcessed:${nfeMessageKey(envelope)}`,
      'effect.execute',
      `markDeadLettered:${nfeMessageKey(envelope)}:storage unavailable`,
    ])
  })

  it('isolates idempotency by company and event instead of import alone', async () => {
    const calls: string[] = []
    const otherCompanyEnvelope: NfeProcessingEnvelopeV1 = {
      ...envelope,
      companyId: '00000000-0000-4000-8000-000000000001',
    }
    const handler = new NfeImportWorkerMessageHandler({
      clock: { now: () => now },
      effect: {
        async execute(params) {
          calls.push(`effect.execute:${params.envelope.companyId}`)
          return undefined
        },
      },
      maxAttempts: 3,
      repository: createRepository({
        calls,
        processedKeys: new Set([nfeMessageKey(envelope)]),
      }),
    })

    await expect(handler.handle({ attempt: 0, envelope: otherCompanyEnvelope })).resolves.toEqual({
      type: 'ack',
    })

    expect(calls).toEqual([
      `hasProcessed:${nfeMessageKey(otherCompanyEnvelope)}`,
      `effect.execute:${otherCompanyEnvelope.companyId}`,
      `markProcessed:${nfeMessageKey(otherCompanyEnvelope)}`,
    ])
  })

  it('routes permanent import failures directly to DLQ', async () => {
    const calls: string[] = []
    const handler = new NfeImportWorkerMessageHandler({
      clock: { now: () => now },
      effect: {
        async execute() {
          calls.push('effect.execute')
          throw new NfeImportFatalError('import contract violated')
        },
      },
      maxAttempts: 3,
      repository: createRepository({ calls }),
    })

    await expect(handler.handle({ attempt: 0, envelope })).resolves.toEqual({ type: 'dead-letter' })

    expect(calls).toEqual([
      `hasProcessed:${nfeMessageKey(envelope)}`,
      'effect.execute',
      `markDeadLettered:${nfeMessageKey(envelope)}:import contract violated`,
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
      readonly companyId: string
      readonly eventId: string
      readonly importId: string
    }): Promise<boolean> {
      const key = nfeMessageKey(input)
      params.calls.push(`hasProcessed:${key}`)

      return params.processedKeys?.has(key) ?? false
    },
    async markDeadLettered(input: {
      readonly companyId: string
      readonly eventId: string
      readonly importId: string
      readonly reason: string
    }): Promise<void> {
      params.calls.push(`markDeadLettered:${nfeMessageKey(input)}:${input.reason}`)
    },
    async markProcessed(input: {
      readonly companyId: string
      readonly eventId: string
      readonly importId: string
    }): Promise<void> {
      if (params.markProcessed) {
        await params.markProcessed()
        return
      }

      params.calls.push(`markProcessed:${nfeMessageKey(input)}`)
    },
    async scheduleRetry(input: {
      readonly attempt: number
      readonly companyId: string
      readonly eventId: string
      readonly importId: string
      readonly nextAttemptAt: Date
    }): Promise<void> {
      params.calls.push(
        `scheduleRetry:${nfeMessageKey(input)}:${input.attempt}:${input.nextAttemptAt.toISOString()}`,
      )
    },
  }
}

function nfeMessageKey(
  input:
    | NfeProcessingEnvelopeV1
    | {
        readonly companyId: string
        readonly eventId: string
        readonly importId: string
      },
): string {
  if ('payload' in input) {
    return `${input.companyId}:${input.eventId}:${input.payload.importId}`
  }

  return `${input.companyId}:${input.eventId}:${input.importId}`
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
