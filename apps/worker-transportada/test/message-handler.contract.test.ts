/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'
import {
  FatalWorkerError,
  TransientWorkerError,
  WorkerMessageHandler,
} from '../src/messaging/message-handler.service.js'

const envelope = {
  eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
  type: 'transportada.synthetic' as const,
  version: 1 as const,
  occurredAt: '2026-07-18T20:00:00.000Z',
  companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
  correlationId: 'contract-test-correlation',
  payload: {
    operation: 'contract-test',
  },
}

function createContract(params: { processed?: boolean; effectError?: Error } = {}) {
  const calls: string[] = []

  return {
    calls,
    effect: {
      execute: async () => {
        calls.push('effect.execute')
        if (params.effectError) {
          throw params.effectError
        }
      },
    },
    idempotency: {
      isProcessed: async () => {
        calls.push('idempotency.isProcessed')
        return params.processed ?? false
      },
      markProcessed: async () => {
        calls.push('idempotency.markProcessed')
      },
    },
  }
}

describe('worker message handler contract', () => {
  it('acks only after the effect and idempotency marker complete', async () => {
    const effect = createDeferred()
    const marker = createDeferred()
    const calls: string[] = []
    let settled = false
    const handler = new WorkerMessageHandler({
      effect: {
        async execute() {
          calls.push('effect.execute')
          await effect.promise
        },
      },
      idempotency: {
        async isProcessed() {
          calls.push('idempotency.isProcessed')
          return false
        },
        async markProcessed() {
          calls.push('idempotency.markProcessed')
          await marker.promise
        },
      },
    })

    const handling = handler.handle(envelope).then((disposition) => {
      settled = true
      return disposition
    })

    await Bun.sleep(0)
    expect(calls).toEqual(['idempotency.isProcessed', 'effect.execute'])
    expect(settled).toBe(false)

    effect.resolve()
    await Bun.sleep(0)
    expect(calls).toEqual([
      'idempotency.isProcessed',
      'effect.execute',
      'idempotency.markProcessed',
    ])
    expect(settled).toBe(false)

    marker.resolve()
    await expect(handling).resolves.toEqual({ type: 'ack' })
  })

  it('acks a duplicate without executing its effect again', async () => {
    const contract = createContract({ processed: true })
    const handler = new WorkerMessageHandler({
      effect: contract.effect,
      idempotency: contract.idempotency,
    })

    await expect(handler.handle(envelope)).resolves.toEqual({ type: 'ack' })

    expect(contract.calls).toEqual(['idempotency.isProcessed'])
  })

  it('routes a transient failure to retry without acking', async () => {
    const contract = createContract({
      effectError: new TransientWorkerError('synthetic dependency unavailable'),
    })
    const handler = new WorkerMessageHandler({
      effect: contract.effect,
      idempotency: contract.idempotency,
    })

    await expect(handler.handle(envelope)).resolves.toEqual({ type: 'retry' })

    expect(contract.calls).toEqual(['idempotency.isProcessed', 'effect.execute'])
  })

  it('routes a fatal failure to dead-letter without acking', async () => {
    const contract = createContract({
      effectError: new FatalWorkerError('synthetic message rejected'),
    })
    const handler = new WorkerMessageHandler({
      effect: contract.effect,
      idempotency: contract.idempotency,
    })

    await expect(handler.handle(envelope)).resolves.toEqual({ type: 'dead-letter' })

    expect(contract.calls).toEqual(['idempotency.isProcessed', 'effect.execute'])
  })
})

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
