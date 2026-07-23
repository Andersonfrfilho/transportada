/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { beforeEach, describe, expect, it } from 'bun:test'

import type { NfeProcessingEnvelopeV1 } from '../src/messaging/nfe-processing-envelope.schema.js'
import {
  buildNfeDistributionRabbitMqTopology,
  buildNfeImportRabbitMqTopology,
} from '../src/messaging/nfe-rabbitmq-topology.js'
import { OutboxRelayService } from '../src/outbox/application/outbox-relay.service.js'

const importTopology = buildNfeImportRabbitMqTopology({
  queuePrefix: 'transportada.contract',
})
const distributionTopology = buildNfeDistributionRabbitMqTopology({
  queuePrefix: 'transportada.contract',
})

const now = new Date('2026-07-22T21:00:00.000Z')

type OutboxEntry = {
  readonly actorId: string
  claimExpiresAt?: Date | undefined
  claimOwner?: string | undefined
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly eventType:
    | 'transportada.nfe.import.requested'
    | 'transportada.nfe.distribution.requested'
  readonly importId: string
  publishedAt?: Date | undefined
}

describe('outbox relay contract', () => {
  let sharedEntries: OutboxEntry[]

  beforeEach(() => {
    sharedEntries = [
      createOutboxEntry({
        companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
        eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
        eventType: 'transportada.nfe.import.requested',
      }),
      createOutboxEntry({
        companyId: '00000000-0000-4000-8000-000000000001',
        eventId: '7c446555-c67b-4545-a060-16d55278665e',
        eventType: 'transportada.nfe.distribution.requested',
      }),
    ]
  })

  it('claims due unpublished entries, publishes by topology, and marks publication only after broker confirm', async () => {
    const publishDeferred = createDeferred()
    const calls: string[] = []
    const relay = new OutboxRelayService({
      clock: { now: () => now },
      publisher: {
        async publish(params: {
          readonly envelope: NfeProcessingEnvelopeV1
          readonly topology: { readonly queue: string }
        }) {
          calls.push(`publish:${params.envelope.eventId}:${params.topology.queue}`)
          await publishDeferred.promise
        },
      },
      repository: createOutboxRepository(sharedEntries, calls),
      retryPolicy: {
        classify(error: unknown) {
          throw error
        },
      },
      topologyResolver: {
        resolve(params: { readonly eventType: OutboxEntry['eventType'] }) {
          return params.eventType === 'transportada.nfe.import.requested'
            ? importTopology
            : distributionTopology
        },
      },
    })

    const relayPromise = relay.relayDueEntries({
      claimOwner: 'relay-a',
      leaseMs: 30_000,
      limit: 10,
    })

    await Bun.sleep(0)
    expect(calls).toEqual([
      'claim:relay-a:10',
      `publish:${sharedEntries[0]!.eventId}:${importTopology.queue}`,
    ])
    expect(sharedEntries.every((entry) => entry.publishedAt === undefined)).toBe(true)

    publishDeferred.resolve()
    await expect(relayPromise).resolves.toEqual({
      claimedCount: 2,
      publishedCount: 2,
    })
    expect(calls).toEqual([
      'claim:relay-a:10',
      `publish:${sharedEntries[0]!.eventId}:${importTopology.queue}`,
      `mark-published:relay-a:${sharedEntries[0]!.companyId}:${sharedEntries[0]!.eventId}`,
      `publish:${sharedEntries[1]!.eventId}:${distributionTopology.queue}`,
      `mark-published:relay-a:${sharedEntries[1]!.companyId}:${sharedEntries[1]!.eventId}`,
    ])
    expect(sharedEntries.map((entry) => entry.publishedAt?.toISOString())).toEqual([
      now.toISOString(),
      now.toISOString(),
    ])
  })

  it('allows only one relay instance to hold the active claim until the lease expires', async () => {
    sharedEntries = [
      createOutboxEntry({
        eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
        eventType: 'transportada.nfe.import.requested',
      }),
    ]
    const firstRelay = new OutboxRelayService({
      clock: { now: () => now },
      publisher: { async publish() {} },
      repository: createOutboxRepository(sharedEntries, []),
      retryPolicy: {
        classify(error: unknown) {
          throw error
        },
      },
      topologyResolver: {
        resolve() {
          return importTopology
        },
      },
    })
    const secondRelay = new OutboxRelayService({
      clock: { now: () => new Date('2026-07-22T21:00:05.000Z') },
      publisher: { async publish() {} },
      repository: createOutboxRepository(sharedEntries, []),
      retryPolicy: {
        classify(error: unknown) {
          throw error
        },
      },
      topologyResolver: {
        resolve() {
          return importTopology
        },
      },
    })
    const recoveredRelay = new OutboxRelayService({
      clock: { now: () => new Date('2026-07-22T21:01:01.000Z') },
      publisher: { async publish() {} },
      repository: createOutboxRepository(sharedEntries, []),
      retryPolicy: {
        classify(error: unknown) {
          throw error
        },
      },
      topologyResolver: {
        resolve() {
          return importTopology
        },
      },
    })

    await expect(
      firstRelay.relayDueEntries({ claimOwner: 'relay-a', leaseMs: 30_000, limit: 1 }),
    ).resolves.toEqual({
      claimedCount: 1,
      publishedCount: 1,
    })
    await expect(
      secondRelay.relayDueEntries({ claimOwner: 'relay-b', leaseMs: 30_000, limit: 1 }),
    ).resolves.toEqual({
      claimedCount: 0,
      publishedCount: 0,
    })
    expect(sharedEntries[0]!.claimOwner).toBe('relay-a')

    sharedEntries[0]!.publishedAt = undefined
    sharedEntries[0]!.claimExpiresAt = new Date('2026-07-22T21:00:30.000Z')
    await expect(
      recoveredRelay.relayDueEntries({ claimOwner: 'relay-c', leaseMs: 30_000, limit: 1 }),
    ).resolves.toEqual({
      claimedCount: 1,
      publishedCount: 1,
    })
    expect(sharedEntries[0]!.claimOwner).toBe('relay-c')
  })
})

function createOutboxEntry(
  input: Pick<OutboxEntry, 'eventId' | 'eventType'> & Partial<Pick<OutboxEntry, 'companyId'>>,
): OutboxEntry {
  return {
    actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
    companyId: input.companyId ?? 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
    correlationId: 'contract-test-correlation',
    eventId: input.eventId,
    eventType: input.eventType,
    importId: '97ba42a6-8b96-47c0-bdb5-b75dfed2f95c',
  }
}

function createOutboxRepository(entries: OutboxEntry[], calls: string[]) {
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
          claimOwner: params.claimOwner,
          companyId: entry.companyId,
          correlationId: entry.correlationId,
          eventId: entry.eventId,
          eventType: entry.eventType,
          importId: entry.importId,
          occurredAt: now.toISOString(),
          version: 1 as const,
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
