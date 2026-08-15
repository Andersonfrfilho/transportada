/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { beforeEach, describe, expect, it } from 'bun:test'

import { NfseOutboxRelayService } from '../src/nfse-issuance/application/nfse-outbox-relay.service.js'
import type { NfseOutboxClaimedEntry } from '../src/nfse-issuance/infrastructure/drizzle-nfse-outbox.repository.js'
import {
  nfseProcessingEnvelopeV1Schema,
  type NfseProcessingEnvelopeV1,
} from '../src/messaging/nfse-processing-envelope.schema.js'

const ACTOR_ID = '94127a9d-22c9-4df0-805f-7654290e251a'
const ATTEMPT_ID = '4f6f2e89-bf9b-4d16-b7e7-d8ce6b0f6f5d'
const COMPANY_ID = 'fbc033e7-63e0-4698-adc6-12778bedf4a7'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const FIRST_EVENT_ID = '2cb3a13d-1c71-47df-9406-1a297e752e10'
const SECOND_EVENT_ID = '7c446555-c67b-4545-a060-16d55278665e'
const INVOICE_ID = 'd2f4ef6d-4f5d-45af-a9b0-bf4e0f8f8d4d'

const now = new Date('2026-08-12T21:00:00.000Z')

type StoredEntry = {
  readonly actorId: string
  readonly attemptFingerprint: string
  readonly attemptId: string
  readonly attemptKind: 'cancel' | 'issue'
  claimExpiresAt?: Date | undefined
  claimOwner?: string | undefined
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly eventType: NfseProcessingEnvelopeV1['type']
  readonly invoiceId: string
  publishedAt?: Date | undefined
  readonly status: string
}

describe('NFS-e outbox relay contract', () => {
  let sharedEntries: StoredEntry[]

  beforeEach(() => {
    sharedEntries = [
      createStoredEntry({ eventId: FIRST_EVENT_ID }),
      createStoredEntry({ companyId: OTHER_COMPANY_ID, eventId: SECOND_EVENT_ID }),
    ]
  })

  it('publishes an envelope that satisfies the versioned contract', async () => {
    const published: NfseProcessingEnvelopeV1[] = []
    const relay = createRelay({ entries: [sharedEntries[0]!], published })

    await expect(
      relay.relayDueEntries({ claimOwner: 'relay-nfse-a', leaseMs: 30_000, limit: 10 }),
    ).resolves.toEqual({ claimedCount: 1, publishedCount: 1 })

    expect(() => nfseProcessingEnvelopeV1Schema.parse(published[0])).not.toThrow()
  })

  /**
   * O jsonb da linha existe como registro, não como transporte. Se o relay o copiasse para a
   * mensagem, o motivo do cancelamento — texto livre do operador — atravessaria o broker.
   */
  it('builds the payload from the typed columns and ignores the outbox jsonb', async () => {
    const published: NfseProcessingEnvelopeV1[] = []
    const relay = createRelay({
      contaminateJsonb: true,
      entries: [sharedEntries[0]!],
      published,
    })

    await relay.relayDueEntries({ claimOwner: 'relay-nfse-a', leaseMs: 30_000, limit: 10 })

    expect(published[0]?.payload).toEqual({
      attemptFingerprint: 'nfsefingerprint-001',
      attemptId: ATTEMPT_ID,
      attemptKind: 'issue',
      invoiceId: INVOICE_ID,
      status: 'requested',
    })
    expect(() => nfseProcessingEnvelopeV1Schema.parse(published[0])).not.toThrow()
  })

  it('publishes the cancellation event without carrying the cancellation reason', async () => {
    const published: NfseProcessingEnvelopeV1[] = []
    const relay = createRelay({
      contaminateJsonb: true,
      entries: [
        createStoredEntry({
          attemptKind: 'cancel',
          eventId: FIRST_EVENT_ID,
          eventType: 'transportada.nfse.invoice.cancel.requested',
          status: 'cancellation_requested',
        }),
      ],
      published,
    })

    await relay.relayDueEntries({ claimOwner: 'relay-nfse-a', leaseMs: 30_000, limit: 10 })

    expect(published[0]?.type).toBe('transportada.nfse.invoice.cancel.requested')
    expect(published[0]?.payload.attemptKind).toBe('cancel')
    expect(JSON.stringify(published[0])).not.toContain('cancellationReason')
    expect(() => nfseProcessingEnvelopeV1Schema.parse(published[0])).not.toThrow()
  })

  it('claims due unpublished entries and publishes them in order', async () => {
    const publishDeferred = createDeferred()
    const calls: string[] = []
    const relay = new NfseOutboxRelayService({
      clock: { now: () => now },
      publisher: {
        async publish(params: { readonly envelope: NfseProcessingEnvelopeV1 }) {
          calls.push(`publish:${params.envelope.eventId}`)
          await publishDeferred.promise
        },
      },
      repository: createOutboxRepository({ calls, entries: sharedEntries }),
      retryPolicy: { classify: rethrow },
    })

    const relayPromise = relay.relayDueEntries({
      claimOwner: 'relay-nfse-a',
      leaseMs: 30_000,
      limit: 10,
    })

    await Bun.sleep(0)
    expect(calls).toEqual(['claim:relay-nfse-a:10', `publish:${FIRST_EVENT_ID}`])
    expect(sharedEntries.every((entry) => entry.publishedAt === undefined)).toBe(true)

    publishDeferred.resolve()
    await expect(relayPromise).resolves.toEqual({ claimedCount: 2, publishedCount: 2 })
    expect(calls).toEqual([
      'claim:relay-nfse-a:10',
      `publish:${FIRST_EVENT_ID}`,
      `mark-published:relay-nfse-a:${COMPANY_ID}:${FIRST_EVENT_ID}`,
      `publish:${SECOND_EVENT_ID}`,
      `mark-published:relay-nfse-a:${OTHER_COMPANY_ID}:${SECOND_EVENT_ID}`,
    ])
    expect(sharedEntries.map((entry) => entry.publishedAt?.toISOString())).toEqual([
      now.toISOString(),
      now.toISOString(),
    ])
  })

  it('keeps one active claim owner until lease expiry', async () => {
    const entries = [createStoredEntry({ eventId: FIRST_EVENT_ID })]
    const firstRelay = createRelay({ entries, published: [] })
    const concurrentRelay = createRelay({
      entries,
      now: new Date('2026-08-12T21:00:05.000Z'),
      published: [],
    })
    const recoveredRelay = createRelay({
      entries,
      now: new Date('2026-08-12T21:01:01.000Z'),
      published: [],
    })

    await expect(
      firstRelay.relayDueEntries({ claimOwner: 'relay-nfse-a', leaseMs: 30_000, limit: 1 }),
    ).resolves.toEqual({ claimedCount: 1, publishedCount: 1 })
    await expect(
      concurrentRelay.relayDueEntries({ claimOwner: 'relay-nfse-b', leaseMs: 30_000, limit: 1 }),
    ).resolves.toEqual({ claimedCount: 0, publishedCount: 0 })
    expect(entries[0]!.claimOwner).toBe('relay-nfse-a')

    entries[0]!.publishedAt = undefined
    entries[0]!.claimExpiresAt = new Date('2026-08-12T21:00:30.000Z')
    await expect(
      recoveredRelay.relayDueEntries({ claimOwner: 'relay-nfse-c', leaseMs: 30_000, limit: 1 }),
    ).resolves.toEqual({ claimedCount: 1, publishedCount: 1 })
    expect(entries[0]!.claimOwner).toBe('relay-nfse-c')
  })

  it('honours the per-cycle limit', async () => {
    const calls: string[] = []
    const relay = createRelay({ calls, entries: sharedEntries, published: [] })

    await expect(
      relay.relayDueEntries({ claimOwner: 'relay-nfse-a', leaseMs: 30_000, limit: 1 }),
    ).resolves.toEqual({ claimedCount: 1, publishedCount: 1 })
    expect(calls).toEqual([
      'claim:relay-nfse-a:1',
      `publish:${FIRST_EVENT_ID}`,
      `mark-published:relay-nfse-a:${COMPANY_ID}:${FIRST_EVENT_ID}`,
    ])
    expect(sharedEntries[1]?.publishedAt).toBeUndefined()
  })

  /** Marcar publicado uma mensagem que não foi entregue é perder a emissão em silêncio. */
  it('leaves the entry unpublished when publishing fails', async () => {
    const calls: string[] = []
    const entries = [createStoredEntry({ eventId: FIRST_EVENT_ID })]
    const relay = new NfseOutboxRelayService({
      clock: { now: () => now },
      publisher: {
        async publish() {
          throw new Error('broker unavailable')
        },
      },
      repository: createOutboxRepository({ calls, entries }),
      retryPolicy: { classify: rethrow },
    })

    await expect(
      relay.relayDueEntries({ claimOwner: 'relay-nfse-a', leaseMs: 30_000, limit: 10 }),
    ).rejects.toThrow('broker unavailable')
    expect(calls).toEqual(['claim:relay-nfse-a:10'])
    expect(entries[0]?.publishedAt).toBeUndefined()
  })

  /** O `claim` é do banco; o relay confere o dono antes de publicar em nome de outro processo. */
  it('skips entries claimed by another owner', async () => {
    const published: NfseProcessingEnvelopeV1[] = []
    const relay = new NfseOutboxRelayService({
      clock: { now: () => now },
      publisher: {
        async publish(params: { readonly envelope: NfseProcessingEnvelopeV1 }) {
          published.push(params.envelope)
        },
      },
      repository: {
        async claimDueEntries() {
          return [toClaimedEntry({ claimOwner: 'relay-nfse-b', entry: sharedEntries[0]! })]
        },
        async markPublished() {
          throw new Error('must not mark an entry owned by another relay')
        },
      },
      retryPolicy: { classify: rethrow },
    })

    await expect(
      relay.relayDueEntries({ claimOwner: 'relay-nfse-a', leaseMs: 30_000, limit: 10 }),
    ).resolves.toEqual({ claimedCount: 1, publishedCount: 0 })
    expect(published).toEqual([])
  })
})

function rethrow(error: unknown): never {
  throw error
}

function createStoredEntry(
  input: Partial<Pick<StoredEntry, 'attemptKind' | 'companyId' | 'eventType' | 'status'>> &
    Pick<StoredEntry, 'eventId'>,
): StoredEntry {
  return {
    actorId: ACTOR_ID,
    attemptFingerprint: 'nfsefingerprint-001',
    attemptId: ATTEMPT_ID,
    attemptKind: input.attemptKind ?? 'issue',
    companyId: input.companyId ?? COMPANY_ID,
    correlationId: 'contract-test-correlation',
    eventId: input.eventId,
    eventType: input.eventType ?? 'transportada.nfse.invoice.issue.requested',
    invoiceId: INVOICE_ID,
    status: input.status ?? 'requested',
  }
}

function toClaimedEntry(input: {
  readonly claimOwner: string
  readonly entry: StoredEntry
}): NfseOutboxClaimedEntry {
  return {
    actorId: input.entry.actorId,
    aggregateId: input.entry.invoiceId,
    attemptFingerprint: input.entry.attemptFingerprint,
    attemptId: input.entry.attemptId,
    attemptKind: input.entry.attemptKind,
    claimOwner: input.claimOwner,
    companyId: input.entry.companyId,
    correlationId: input.entry.correlationId,
    eventId: input.entry.eventId,
    eventType: input.entry.eventType,
    eventVersion: 1,
    invoiceId: input.entry.invoiceId,
    occurredAt: now.toISOString(),
    status: input.entry.status,
  }
}

/**
 * A linha real tem uma coluna `payload jsonb`. O tipo reclamado não a expõe, e este molde entrega
 * a linha com ela preenchida para provar que o relay não a alcança nem por acidente.
 */
function contaminate(entry: NfseOutboxClaimedEntry): NfseOutboxClaimedEntry {
  const contaminated: NfseOutboxClaimedEntry & { readonly payload: Record<string, string> } = {
    ...entry,
    payload: {
      cancellationReason: 'cliente pediu por telefone',
      takerLegalName: 'Tomador do Contrato Ltda',
    },
  }

  return contaminated
}

function createOutboxRepository(input: {
  readonly calls?: string[]
  readonly contaminateJsonb?: boolean
  readonly entries: StoredEntry[]
}) {
  return {
    async claimDueEntries(params: {
      readonly claimOwner: string
      readonly leaseMs: number
      readonly limit: number
      readonly now: Date
    }): Promise<readonly NfseOutboxClaimedEntry[]> {
      input.calls?.push(`claim:${params.claimOwner}:${params.limit}`)
      const dueEntries = input.entries
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
        const claimed = toClaimedEntry({ claimOwner: params.claimOwner, entry })

        return input.contaminateJsonb === true ? contaminate(claimed) : claimed
      })
    },
    async markPublished(params: {
      readonly claimOwner: string
      readonly companyId: string
      readonly eventId: string
      readonly publishedAt: Date
    }): Promise<void> {
      input.calls?.push(`mark-published:${params.claimOwner}:${params.companyId}:${params.eventId}`)
      const entry = input.entries.find(
        (candidate) =>
          candidate.companyId === params.companyId && candidate.eventId === params.eventId,
      )
      if (entry === undefined || entry.claimOwner !== params.claimOwner) {
        throw new Error('claim ownership mismatch')
      }
      entry.publishedAt = params.publishedAt
    },
  }
}

function createRelay(input: {
  readonly calls?: string[]
  readonly contaminateJsonb?: boolean
  readonly entries: StoredEntry[]
  readonly now?: Date
  readonly published: NfseProcessingEnvelopeV1[]
}): NfseOutboxRelayService {
  const clockNow = input.now ?? now

  return new NfseOutboxRelayService({
    clock: { now: () => clockNow },
    publisher: {
      async publish(params: { readonly envelope: NfseProcessingEnvelopeV1 }) {
        input.calls?.push(`publish:${params.envelope.eventId}`)
        input.published.push(params.envelope)
      },
    },
    repository: createOutboxRepository({
      ...(input.calls === undefined ? {} : { calls: input.calls }),
      ...(input.contaminateJsonb === undefined ? {} : { contaminateJsonb: input.contaminateJsonb }),
      entries: input.entries,
    }),
    retryPolicy: { classify: rethrow },
  })
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve() {
      if (resolvePromise === undefined) {
        throw new Error('Deferred resolver is unavailable')
      }
      resolvePromise()
    },
  }
}
