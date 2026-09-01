/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'
import { WorkerShutdown } from '../src/runtime/worker-shutdown.service.js'

import './shutdown/broker-connections-close.contract.js'

describe('worker shutdown contract', () => {
  it('cancels consumption before closing infrastructure and is idempotent', async () => {
    const calls: string[] = []
    const cancellation = createDeferred()
    const shutdown = new WorkerShutdown({
      consumers: [
        {
          cancel: async () => {
            calls.push('consumer.cancel')
            await cancellation.promise
          },
        },
      ],
      provider: {
        close: async () => {
          calls.push('provider.close')
        },
      },
      database: {
        close: async () => {
          calls.push('database.close')
        },
      },
      healthServer: {
        stop: async () => {
          calls.push('healthServer.stop')
        },
      },
    })

    const stops = [shutdown.stop(), shutdown.stop()]

    await Bun.sleep(0)
    expect(calls).toEqual(['consumer.cancel'])

    cancellation.resolve()
    await Promise.all(stops)

    expect(calls).toEqual([
      'consumer.cancel',
      'provider.close',
      'database.close',
      'healthServer.stop',
    ])
  })

  it('closes every resource even when consumer cancellation fails', async () => {
    const calls: string[] = []
    const shutdown = new WorkerShutdown({
      consumers: [
        {
          cancel: async () => {
            calls.push('consumer.cancel')
            throw new Error('consumer cancellation failed')
          },
        },
      ],
      provider: {
        close: async () => {
          calls.push('provider.close')
        },
      },
      database: {
        close: async () => {
          calls.push('database.close')
        },
      },
      healthServer: {
        stop: async () => {
          calls.push('healthServer.stop')
        },
      },
    })

    await expect(shutdown.stop()).rejects.toThrow('consumer cancellation failed')

    expect(calls).toEqual([
      'consumer.cancel',
      'provider.close',
      'database.close',
      'healthServer.stop',
    ])
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
