/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { PersistentProcessedMessageService } from '../src/outbox/application/persistent-processed-message.service.js'

describe('processed message idempotency contract', () => {
  it('runs the effect once per company, consumer, and event ID, then persists the marker', async () => {
    const calls: string[] = []
    const service = new PersistentProcessedMessageService({
      repository: createProcessedMessageRepository(calls),
    })

    await expect(
      service.runOnce({
        companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
        consumerName: 'nfe-import-consumer',
        effect: async () => {
          calls.push('effect')
          return { type: 'ack' as const }
        },
        eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
        successResult: 'imported',
      }),
    ).resolves.toEqual({ type: 'ack' })

    await expect(
      service.runOnce({
        companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
        consumerName: 'nfe-import-consumer',
        effect: async () => {
          calls.push('effect-duplicate')
          return { type: 'ack' as const }
        },
        eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
        successResult: 'imported',
      }),
    ).resolves.toEqual({ type: 'ack' })

    expect(calls).toEqual([
      'has:fbc033e7-63e0-4698-adc6-12778bedf4a7:nfe-import-consumer:2cb3a13d-1c71-47df-9406-1a297e752e10',
      'effect',
      'mark:fbc033e7-63e0-4698-adc6-12778bedf4a7:nfe-import-consumer:2cb3a13d-1c71-47df-9406-1a297e752e10:imported',
      'has:fbc033e7-63e0-4698-adc6-12778bedf4a7:nfe-import-consumer:2cb3a13d-1c71-47df-9406-1a297e752e10',
    ])
  })

  it('does not persist the processed marker when the effect fails before commit', async () => {
    const calls: string[] = []
    const service = new PersistentProcessedMessageService({
      repository: createProcessedMessageRepository(calls),
    })

    await expect(
      service.runOnce({
        companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
        consumerName: 'nfe-import-consumer',
        effect: async () => {
          calls.push('effect')
          throw new Error('db-commit-failed')
        },
        eventId: '7c446555-c67b-4545-a060-16d55278665e',
        successResult: 'imported',
      }),
    ).rejects.toThrow('db-commit-failed')

    expect(calls).toEqual([
      'has:fbc033e7-63e0-4698-adc6-12778bedf4a7:nfe-import-consumer:7c446555-c67b-4545-a060-16d55278665e',
      'effect',
    ])
  })

  it('scopes duplicates by company and consumer instead of using a global in-memory set', async () => {
    const calls: string[] = []
    const service = new PersistentProcessedMessageService({
      repository: createProcessedMessageRepository(calls),
    })

    await expect(
      service.runOnce({
        companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
        consumerName: 'nfe-import-consumer',
        effect: async () => ({ type: 'ack' as const }),
        eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
        successResult: 'imported',
      }),
    ).resolves.toEqual({ type: 'ack' })
    await expect(
      service.runOnce({
        companyId: '00000000-0000-4000-8000-000000000001',
        consumerName: 'nfe-import-consumer',
        effect: async () => ({ type: 'ack' as const }),
        eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
        successResult: 'imported',
      }),
    ).resolves.toEqual({ type: 'ack' })
    await expect(
      service.runOnce({
        companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
        consumerName: 'nfe-distribution-consumer',
        effect: async () => ({ type: 'ack' as const }),
        eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
        successResult: 'imported',
      }),
    ).resolves.toEqual({ type: 'ack' })

    expect(calls.filter((call) => call.startsWith('mark:'))).toHaveLength(3)
  })

  it('serializes concurrent effects for the same company, consumer, and event ID', async () => {
    const calls: string[] = []
    const repository = createProcessedMessageRepository(calls, { withLock: true })
    const service = new PersistentProcessedMessageService({ repository })
    const slowEffect = async () => {
      calls.push('effect')
      await Bun.sleep(10)

      return { type: 'ack' as const }
    }

    await expect(
      Promise.all([
        service.runOnce({
          companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
          consumerName: 'nfe-import-consumer',
          effect: slowEffect,
          eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
          successResult: 'imported',
        }),
        service.runOnce({
          companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
          consumerName: 'nfe-import-consumer',
          effect: slowEffect,
          eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
          successResult: 'imported',
        }),
      ]),
    ).resolves.toEqual([{ type: 'ack' }, { type: 'ack' }])

    expect(calls.filter((call) => call === 'effect')).toHaveLength(1)
    expect(calls.filter((call) => call.startsWith('lock:'))).toHaveLength(2)
  })
})

function createProcessedMessageRepository(
  calls: string[],
  options: { readonly withLock?: boolean } = {},
) {
  const processed = new Set<string>()
  let previousLock = Promise.resolve()

  const repository = {
    async hasProcessed(params: {
      readonly companyId: string
      readonly consumerName: string
      readonly eventId: string
    }) {
      const key = `${params.companyId}:${params.consumerName}:${params.eventId}`
      calls.push(`has:${key}`)
      return processed.has(key)
    },
    async markProcessed(params: {
      readonly companyId: string
      readonly consumerName: string
      readonly eventId: string
      readonly result: string
    }) {
      const key = `${params.companyId}:${params.consumerName}:${params.eventId}`
      calls.push(`mark:${key}:${params.result}`)
      processed.add(key)
    },
  }

  if (!options.withLock) {
    return repository
  }

  return {
    ...repository,
    async runWithProcessingLock(params: {
      readonly companyId: string
      readonly consumerName: string
      readonly eventId: string
      readonly operation: () => Promise<{ readonly type: 'ack' }>
    }) {
      const key = `${params.companyId}:${params.consumerName}:${params.eventId}`
      calls.push(`lock:${key}`)
      const activeLock = previousLock
      let releaseCurrentLock: (() => void) | undefined
      previousLock = new Promise<void>((resolve) => {
        releaseCurrentLock = resolve
      })
      await activeLock

      try {
        return await params.operation()
      } finally {
        releaseCurrentLock?.()
      }
    },
  }
}
