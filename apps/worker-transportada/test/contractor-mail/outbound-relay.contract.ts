/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ContractorMailOutboundOutboxRelayService } from '../../src/contractor-mail/application/contractor-mail-outbound-outbox-relay.service.js'
import { CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-outbound-envelope.schema.js'
import type { ContractorMailOutboundOutboxClaimedEntry } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-outbound-outbox.repository.js'
import type { ContractorMailOutboundEnvelopeV1 } from '../../src/messaging/contractor-mail-outbound-envelope.schema.js'

const NOW = new Date('2026-09-13T12:00:00.000Z')

function buildEntry(overrides?: Partial<ContractorMailOutboundOutboxClaimedEntry>) {
  return {
    claimOwner: 'relay-owner',
    companyId: crypto.randomUUID(),
    correlationId: 'contractor-mail-outbound-relay-0001',
    eventId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    occurredAt: NOW.toISOString(),
    replyToAddress: 'token@resposta.example.com.br',
    toAddress: 'admin@example.com.br',
    ...overrides,
  } satisfies ContractorMailOutboundOutboxClaimedEntry
}

describe('contractor mail outbound outbox relay (spec 143, T009)', () => {
  test('publishes each claimed entry with the reference-only envelope, then marks it published', async () => {
    const entry = buildEntry()
    const published: ContractorMailOutboundEnvelopeV1[] = []
    const markedPublished: { companyId: string; eventId: string }[] = []

    const relay = new ContractorMailOutboundOutboxRelayService({
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
        payload: {
          messageId: entry.messageId,
          replyToAddress: entry.replyToAddress,
          toAddress: entry.toAddress,
        },
        type: CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE.MESSAGE_SEND_REQUESTED,
        version: 1,
      },
    ])
    expect(markedPublished).toEqual([{ companyId: entry.companyId, eventId: entry.eventId }])
  })

  /** Corrida perdida: o dono do claim mudou entre a leitura e o publish — não publica nem marca. */
  test('skips an entry whose claim owner no longer matches', async () => {
    const entry = buildEntry({ claimOwner: 'someone-else' })
    const published: unknown[] = []
    const markedPublished: unknown[] = []

    const relay = new ContractorMailOutboundOutboxRelayService({
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

    const relay = new ContractorMailOutboundOutboxRelayService({
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
