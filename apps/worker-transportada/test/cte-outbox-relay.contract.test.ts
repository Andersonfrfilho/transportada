/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { beforeEach, describe, expect, it } from 'bun:test'

import type { CteProcessingEnvelopeV1 } from '../src/messaging/cte-processing-envelope.schema.js'
import { CteOutboxRelayService } from '../src/cte-issuance/application/cte-outbox-relay.service.js'

type CteOutboxEntry = {
  readonly actorId: string
  claimExpiresAt?: Date | undefined
  claimOwner?: string | undefined
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly eventType: 'transportada.cte.item.issue.requested'
  readonly batchId: string
  readonly batchItemId: string
  readonly attemptId: string
  readonly attemptFingerprint: string
  readonly attemptKind: 'issue' | 'reprocess'
  readonly payloadStatus: string
  publishedAt?: Date | undefined
}

const now = new Date('2026-07-22T21:00:00.000Z')

describe('CT-e outbox relay contract', () => {
  let sharedEntries: CteOutboxEntry[]

  beforeEach(() => {
    sharedEntries = [
      createOutboxEntry({
        companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
        eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
      }),
      createOutboxEntry({
        companyId: '00000000-0000-4000-8000-000000000001',
        eventId: '7c446555-c67b-4545-a060-16d55278665e',
      }),
    ]
  })

  it('claims due unpublished entries and publishes envelopes in-order', async () => {
    const publishDeferred = createDeferred()
    const calls: string[] = []
    const relay = new CteOutboxRelayService({
      clock: { now: () => now },
      publisher: {
        async publish(params: { readonly envelope: CteProcessingEnvelopeV1 }) {
          calls.push(`publish:${params.envelope.eventId}`)
          await publishDeferred.promise
        },
      },
      repository: createOutboxRepository(sharedEntries, calls),
      retryPolicy: {
        classify(error: unknown) {
          throw error
        },
      },
    })

    const relayPromise = relay.relayDueEntries({
      claimOwner: 'relay-cte-a',
      leaseMs: 30_000,
      limit: 10,
    })

    await Bun.sleep(0)
    expect(calls).toEqual(['claim:relay-cte-a:10', 'publish:2cb3a13d-1c71-47df-9406-1a297e752e10'])
    expect(sharedEntries.every((entry) => entry.publishedAt === undefined)).toBe(true)

    publishDeferred.resolve()
    await expect(relayPromise).resolves.toEqual({ claimedCount: 2, publishedCount: 2 })
    expect(calls).toEqual([
      'claim:relay-cte-a:10',
      'publish:2cb3a13d-1c71-47df-9406-1a297e752e10',
      'mark-published:relay-cte-a:fbc033e7-63e0-4698-adc6-12778bedf4a7:2cb3a13d-1c71-47df-9406-1a297e752e10',
      'publish:7c446555-c67b-4545-a060-16d55278665e',
      'mark-published:relay-cte-a:00000000-0000-4000-8000-000000000001:7c446555-c67b-4545-a060-16d55278665e',
    ])
    expect(sharedEntries.map((entry) => entry.publishedAt?.toISOString())).toEqual([
      now.toISOString(),
      now.toISOString(),
    ])
  })

  it('keeps one active claim owner until lease expiry', async () => {
    sharedEntries = [
      createOutboxEntry({
        eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
      }),
    ]

    const firstRelay = new CteOutboxRelayService({
      clock: { now: () => now },
      publisher: { async publish() {} },
      repository: createOutboxRepository(sharedEntries, []),
      retryPolicy: {
        classify(error: unknown) {
          throw error
        },
      },
    })
    const secondRelay = new CteOutboxRelayService({
      clock: { now: () => new Date('2026-07-22T21:00:05.000Z') },
      publisher: { async publish() {} },
      repository: createOutboxRepository(sharedEntries, []),
      retryPolicy: {
        classify(error: unknown) {
          throw error
        },
      },
    })
    const recoveredRelay = new CteOutboxRelayService({
      clock: { now: () => new Date('2026-07-22T21:01:01.000Z') },
      publisher: { async publish() {} },
      repository: createOutboxRepository(sharedEntries, []),
      retryPolicy: {
        classify(error: unknown) {
          throw error
        },
      },
    })

    await expect(
      firstRelay.relayDueEntries({ claimOwner: 'relay-cte-a', leaseMs: 30_000, limit: 1 }),
    ).resolves.toEqual({ claimedCount: 1, publishedCount: 1 })
    await expect(
      secondRelay.relayDueEntries({ claimOwner: 'relay-cte-b', leaseMs: 30_000, limit: 1 }),
    ).resolves.toEqual({ claimedCount: 0, publishedCount: 0 })
    expect(sharedEntries[0]!.claimOwner).toBe('relay-cte-a')

    sharedEntries[0]!.publishedAt = undefined
    sharedEntries[0]!.claimExpiresAt = new Date('2026-07-22T21:00:30.000Z')
    await expect(
      recoveredRelay.relayDueEntries({ claimOwner: 'relay-cte-c', leaseMs: 30_000, limit: 1 }),
    ).resolves.toEqual({ claimedCount: 1, publishedCount: 1 })
    expect(sharedEntries[0]!.claimOwner).toBe('relay-cte-c')
  })
})

function createOutboxEntry(
  input: Pick<CteOutboxEntry, 'eventId'> & Partial<Pick<CteOutboxEntry, 'companyId'>>,
): CteOutboxEntry {
  return {
    actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
    companyId: input.companyId ?? 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
    correlationId: 'contract-test-correlation',
    eventId: input.eventId,
    eventType: 'transportada.cte.item.issue.requested',
    batchId: 'd2f4ef6d-4f5d-45af-a9b0-bf4e0f8f8d4d',
    batchItemId: '8a7d8b98-ff3e-4f5f-9967-57fdb2e7e2d8',
    attemptId: '4f6f2e89-bf9b-4d16-b7e7-d8ce6b0f6f5d',
    attemptFingerprint: 'ctefingerprint-001',
    attemptKind: 'issue',
    payloadStatus: 'requested',
  }
}

function createOutboxRepository(entries: CteOutboxEntry[], calls: string[]) {
  return {
    async claimDueEntries(params: {
      readonly claimOwner: string
      readonly leaseMs: number
      readonly limit: number
      readonly now: Date
    }) {
      calls.push(`claim:${params.claimOwner}:${params.limit}`)
      const dueEntries = entries
        .filter((entry) => entry.publishedAt === undefined)
        .filter(
          (entry) =>
            entry.claimOwner === undefined ||
            entry.claimExpiresAt === undefined ||
            entry.claimExpiresAt.getTime() <= params.now.getTime(),
        )
        .slice(0, params.limit)

      return dueEntries.map((entry) => {
        entry.claimOwner = params.claimOwner
        entry.claimExpiresAt = new Date(params.now.getTime() + params.leaseMs)

        return {
          actorId: entry.actorId,
          attemptFingerprint: entry.attemptFingerprint,
          attemptId: entry.attemptId,
          aggregateId: entry.batchId,
          aggregateType: 'cte_batch',
          aggregateSubtype: 'item',
          batchId: entry.batchId,
          batchItemId: entry.batchItemId,
          attemptKind: entry.attemptKind,
          claimOwner: params.claimOwner,
          companyId: entry.companyId,
          correlationId: entry.correlationId,
          eventId: entry.eventId,
          eventType: 'transportada.cte.item.issue.requested' as const,
          occurredAt: now.toISOString(),
          payload: {
            batchItemId: entry.batchItemId,
            batchId: entry.batchId,
            attemptId: entry.attemptId,
            attemptFingerprint: entry.attemptFingerprint,
            attemptKind: entry.attemptKind,
            status: entry.payloadStatus,
          },
          eventVersion: 1 as const,
        }
      })
    },
    async markPublished(params: {
      readonly claimOwner: string
      readonly companyId: string
      readonly eventId: string
      readonly publishedAt: Date
    }) {
      calls.push(`mark-published:${params.claimOwner}:${params.companyId}:${params.eventId}`)
      const entry = entries.find(
        (candidate) =>
          candidate.companyId === params.companyId && candidate.eventId === params.eventId,
      )
      if (!entry || entry.claimOwner !== params.claimOwner) {
        throw new Error('claim ownership mismatch')
      }
      entry.publishedAt = params.publishedAt
    },
  }
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
