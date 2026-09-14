/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ContractorMailInboundOutboxRelayService } from '../../src/contractor-mail/application/contractor-mail-inbound-outbox-relay.service.js'
import { CONTRACTOR_MAIL_INBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-inbound-envelope.schema.js'
import type { ContractorMailInboundOutboxClaimedEntry } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-inbound-outbox.repository.js'
import type { ContractorMailInboundEnvelopeV1 } from '../../src/messaging/contractor-mail-inbound-envelope.schema.js'

const NOW = new Date('2026-09-13T12:00:00.000Z')

function buildEntry(
  overrides?: Partial<ContractorMailInboundOutboxClaimedEntry>,
): ContractorMailInboundOutboxClaimedEntry {
  return {
    claimOwner: 'relay-owner',
    companyId: crypto.randomUUID(),
    correlationId: 'contractor-mail-inbound-relay-0001',
    eventId: crypto.randomUUID(),
    occurredAt: NOW.toISOString(),
    providerEmailId: 'evt_relay_0001',
    ...overrides,
  }
}

describe('contractor mail inbound outbox relay (spec 143, T010)', () => {
  test('publishes each claimed entry with a payload carrying only providerEmailId, then marks it published', async () => {
    const entry = buildEntry()
    const published: ContractorMailInboundEnvelopeV1[] = []
    const markedPublished: { companyId: string; eventId: string }[] = []

    const relay = new ContractorMailInboundOutboxRelayService({
      clock: { now: () => NOW },
      publisher: {
        async publish({ envelope }) {
          published.push(envelope)
        },
      },
      repository: {
        async claimDueEntries() {
          return [entry]
        },
        async markPublished({ companyId, eventId }) {
          markedPublished.push({ companyId, eventId })
        },
      },
      retryPolicy: {
        classify(error: unknown): never {
          throw error
        },
      },
    })

    const result = await relay.relayDueEntries({
      claimOwner: 'relay-owner',
      leaseMs: 30_000,
      limit: 25,
    })

    expect(result).toEqual({ claimedCount: 1, publishedCount: 1 })
    expect(published).toEqual([
      {
        companyId: entry.companyId,
        correlationId: entry.correlationId,
        eventId: entry.eventId,
        occurredAt: entry.occurredAt,
        payload: { providerEmailId: entry.providerEmailId },
        type: CONTRACTOR_MAIL_INBOUND_EVENT_TYPE.EMAIL_RECEIVED,
        version: 1,
      },
    ])
    expect(Object.keys(published[0]?.payload ?? {})).toEqual(['providerEmailId'])
    expect(markedPublished).toEqual([{ companyId: entry.companyId, eventId: entry.eventId }])
  })

  test('skips an entry whose claim owner no longer matches', async () => {
    const entry = buildEntry({ claimOwner: 'someone-else' })
    const published: unknown[] = []
    const markedPublished: unknown[] = []

    const relay = new ContractorMailInboundOutboxRelayService({
      clock: { now: () => NOW },
      publisher: {
        async publish() {
          published.push(true)
        },
      },
      repository: {
        async claimDueEntries() {
          return [entry]
        },
        async markPublished() {
          markedPublished.push(true)
        },
      },
      retryPolicy: {
        classify(error: unknown): never {
          throw error
        },
      },
    })

    const result = await relay.relayDueEntries({
      claimOwner: 'relay-owner',
      leaseMs: 30_000,
      limit: 25,
    })

    expect(result).toEqual({ claimedCount: 1, publishedCount: 0 })
    expect(published).toEqual([])
    expect(markedPublished).toEqual([])
  })

  test('classifies a publish failure through the retry policy, never marking it published', async () => {
    const entry = buildEntry()
    const markedPublished: unknown[] = []

    const relay = new ContractorMailInboundOutboxRelayService({
      clock: { now: () => NOW },
      publisher: {
        async publish() {
          throw new Error('broker unreachable')
        },
      },
      repository: {
        async claimDueEntries() {
          return [entry]
        },
        async markPublished() {
          markedPublished.push(true)
        },
      },
      retryPolicy: {
        classify(error: unknown): never {
          throw error instanceof Error ? error : new Error('unknown')
        },
      },
    })

    await expect(
      relay.relayDueEntries({ claimOwner: 'relay-owner', leaseMs: 30_000, limit: 25 }),
    ).rejects.toThrow('broker unreachable')
    expect(markedPublished).toEqual([])
  })
})
