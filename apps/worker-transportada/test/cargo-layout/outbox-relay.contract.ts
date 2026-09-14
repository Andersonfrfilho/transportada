/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { beforeEach, describe, expect, it } from 'bun:test'

import { CargoLayoutOutboxRelayService } from '../../src/cargo-layout/application/cargo-layout-outbox-relay.service.js'
import type { CargoLayoutOutboxClaimedEntry } from '../../src/cargo-layout/infrastructure/drizzle-cargo-layout-outbox.repository.js'
import {
  CARGO_LAYOUT_EVENT_TYPE,
  cargoLayoutEnvelopeV1Schema,
  type CargoLayoutEnvelopeV1,
} from '../../src/messaging/cargo-layout-envelope.schema.js'

const COMPANY_ID = 'fbc033e7-63e0-4698-adc6-12778bedf4a7'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const FIRST_EVENT_ID = '2cb3a13d-1c71-47df-9406-1a297e752e10'
const SECOND_EVENT_ID = '7c446555-c67b-4545-a060-16d55278665e'
const FIRST_LAYOUT_ID = 'd2f4ef6d-4f5d-45af-a9b0-bf4e0f8f8d4d'
const SECOND_LAYOUT_ID = '4f6f2e89-bf9b-4d16-b7e7-d8ce6b0f6f5d'
const INPUT_HASH = 'a3f1c2d4e5b6a7980123456789abcdef0123456789abcdef0123456789abcdef'

const now = new Date('2026-09-12T12:00:00.000Z')

type StoredEntry = {
  claimExpiresAt?: Date | undefined
  claimOwner?: string | undefined
  readonly companyId: string
  readonly eventId: string
  readonly layoutId: string
  publishedAt?: Date | undefined
}

describe('cargo layout outbox relay (spec 145 D8)', () => {
  let sharedEntries: StoredEntry[]

  beforeEach(() => {
    sharedEntries = [
      createStoredEntry({ eventId: FIRST_EVENT_ID, layoutId: FIRST_LAYOUT_ID }),
      createStoredEntry({
        companyId: OTHER_COMPANY_ID,
        eventId: SECOND_EVENT_ID,
        layoutId: SECOND_LAYOUT_ID,
      }),
    ]
  })

  it('publica um envelope que satisfaz o contrato versionado', async () => {
    const published: CargoLayoutEnvelopeV1[] = []
    const relay = createRelay({ entries: [sharedEntries[0]!], published })

    await expect(
      relay.relayDueEntries({ claimOwner: 'relay-cargo-a', leaseMs: 30_000, limit: 10 }),
    ).resolves.toEqual({ claimedCount: 1, publishedCount: 1 })

    expect(cargoLayoutEnvelopeV1Schema.parse(published[0])).toEqual({
      companyId: COMPANY_ID,
      correlationId: 'contract-test-correlation',
      eventId: FIRST_EVENT_ID,
      occurredAt: now.toISOString(),
      payload: { inputHash: INPUT_HASH, layoutId: FIRST_LAYOUT_ID },
      type: CARGO_LAYOUT_EVENT_TYPE.REQUESTED,
      version: 1,
    })
  })

  /**
   * O rótulo da parada e o cliente são PII e moram na coluna `input` da planta. Se o relay copiasse
   * a linha para a mensagem, eles atravessariam o broker — o payload é só referência.
   */
  it('o payload leva só layoutId e inputHash, mesmo com a linha contaminada', async () => {
    const published: CargoLayoutEnvelopeV1[] = []
    const relay = createRelay({ contaminate: true, entries: [sharedEntries[0]!], published })

    await relay.relayDueEntries({ claimOwner: 'relay-cargo-a', leaseMs: 30_000, limit: 10 })

    expect(published[0]?.payload).toEqual({ inputHash: INPUT_HASH, layoutId: FIRST_LAYOUT_ID })
    expect(Object.keys(published[0] ?? {}).sort()).toEqual([
      'companyId',
      'correlationId',
      'eventId',
      'occurredAt',
      'payload',
      'type',
      'version',
    ])
    expect(JSON.stringify(published[0])).not.toContain('Cliente da Parada')
  })

  it('cada envelope carrega o companyId da própria linha', async () => {
    const published: CargoLayoutEnvelopeV1[] = []
    const relay = createRelay({ entries: sharedEntries, published })

    await relay.relayDueEntries({ claimOwner: 'relay-cargo-a', leaseMs: 30_000, limit: 10 })

    expect(published.map((envelope) => [envelope.companyId, envelope.payload.layoutId])).toEqual([
      [COMPANY_ID, FIRST_LAYOUT_ID],
      [OTHER_COMPANY_ID, SECOND_LAYOUT_ID],
    ])
  })

  it('reivindica, publica e marca publicado em ordem, marcando só depois do publish', async () => {
    const publishDeferred = createDeferred()
    const calls: string[] = []
    const relay = new CargoLayoutOutboxRelayService({
      clock: { now: () => now },
      publisher: {
        async publish(params: { readonly envelope: CargoLayoutEnvelopeV1 }) {
          calls.push(`publish:${params.envelope.eventId}`)
          await publishDeferred.promise
        },
      },
      repository: createOutboxRepository({ calls, entries: sharedEntries }),
      retryPolicy: { classify: rethrow },
    })

    const relayPromise = relay.relayDueEntries({
      claimOwner: 'relay-cargo-a',
      leaseMs: 30_000,
      limit: 10,
    })

    await Bun.sleep(0)
    expect(calls).toEqual(['claim:relay-cargo-a:10', `publish:${FIRST_EVENT_ID}`])
    expect(sharedEntries.every((entry) => entry.publishedAt === undefined)).toBe(true)

    publishDeferred.resolve()
    await expect(relayPromise).resolves.toEqual({ claimedCount: 2, publishedCount: 2 })
    expect(calls).toEqual([
      'claim:relay-cargo-a:10',
      `publish:${FIRST_EVENT_ID}`,
      `mark-published:relay-cargo-a:${COMPANY_ID}:${FIRST_EVENT_ID}`,
      `publish:${SECOND_EVENT_ID}`,
      `mark-published:relay-cargo-a:${OTHER_COMPANY_ID}:${SECOND_EVENT_ID}`,
    ])
    expect(sharedEntries.map((entry) => entry.publishedAt?.toISOString())).toEqual([
      now.toISOString(),
      now.toISOString(),
    ])
  })

  it('respeita o tamanho do lote', async () => {
    const calls: string[] = []
    const relay = createRelay({ calls, entries: sharedEntries, published: [] })

    await expect(
      relay.relayDueEntries({ claimOwner: 'relay-cargo-a', leaseMs: 30_000, limit: 1 }),
    ).resolves.toEqual({ claimedCount: 1, publishedCount: 1 })
    expect(calls).toEqual([
      'claim:relay-cargo-a:1',
      `publish:${FIRST_EVENT_ID}`,
      `mark-published:relay-cargo-a:${COMPANY_ID}:${FIRST_EVENT_ID}`,
    ])
    expect(sharedEntries[1]?.publishedAt).toBeUndefined()
  })

  /** Marcar publicado um pedido que não foi entregue é deixar a planta em `queued` para sempre. */
  it('falha de publish não marca a linha como publicada', async () => {
    const calls: string[] = []
    const entries = [createStoredEntry({ eventId: FIRST_EVENT_ID, layoutId: FIRST_LAYOUT_ID })]
    const relay = new CargoLayoutOutboxRelayService({
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
      relay.relayDueEntries({ claimOwner: 'relay-cargo-a', leaseMs: 30_000, limit: 10 }),
    ).rejects.toThrow('broker unavailable')
    expect(calls).toEqual(['claim:relay-cargo-a:10'])
    expect(entries[0]?.publishedAt).toBeUndefined()
  })

  it('mantém um dono de reivindicação até o lease expirar', async () => {
    const entries = [createStoredEntry({ eventId: FIRST_EVENT_ID, layoutId: FIRST_LAYOUT_ID })]
    const firstRelay = createRelay({ entries, published: [] })
    const concurrentRelay = createRelay({
      entries,
      now: new Date('2026-09-12T12:00:05.000Z'),
      published: [],
    })
    const recoveredRelay = createRelay({
      entries,
      now: new Date('2026-09-12T12:01:01.000Z'),
      published: [],
    })

    await expect(
      firstRelay.relayDueEntries({ claimOwner: 'relay-cargo-a', leaseMs: 30_000, limit: 1 }),
    ).resolves.toEqual({ claimedCount: 1, publishedCount: 1 })
    await expect(
      concurrentRelay.relayDueEntries({ claimOwner: 'relay-cargo-b', leaseMs: 30_000, limit: 1 }),
    ).resolves.toEqual({ claimedCount: 0, publishedCount: 0 })
    expect(entries[0]!.claimOwner).toBe('relay-cargo-a')

    entries[0]!.publishedAt = undefined
    entries[0]!.claimExpiresAt = new Date('2026-09-12T12:00:30.000Z')
    await expect(
      recoveredRelay.relayDueEntries({ claimOwner: 'relay-cargo-c', leaseMs: 30_000, limit: 1 }),
    ).resolves.toEqual({ claimedCount: 1, publishedCount: 1 })
    expect(entries[0]!.claimOwner).toBe('relay-cargo-c')
  })

  it('pula linhas reivindicadas por outro dono', async () => {
    const published: CargoLayoutEnvelopeV1[] = []
    const relay = new CargoLayoutOutboxRelayService({
      clock: { now: () => now },
      publisher: {
        async publish(params: { readonly envelope: CargoLayoutEnvelopeV1 }) {
          published.push(params.envelope)
        },
      },
      repository: {
        async claimDueEntries() {
          return [toClaimedEntry({ claimOwner: 'relay-cargo-b', entry: sharedEntries[0]! })]
        },
        async markPublished() {
          throw new Error('must not mark an entry owned by another relay')
        },
      },
      retryPolicy: { classify: rethrow },
    })

    await expect(
      relay.relayDueEntries({ claimOwner: 'relay-cargo-a', leaseMs: 30_000, limit: 10 }),
    ).resolves.toEqual({ claimedCount: 1, publishedCount: 0 })
    expect(published).toEqual([])
  })
})

function rethrow(error: unknown): never {
  throw error
}

function createStoredEntry(
  input: Partial<Pick<StoredEntry, 'companyId'>> & Pick<StoredEntry, 'eventId' | 'layoutId'>,
): StoredEntry {
  return {
    companyId: input.companyId ?? COMPANY_ID,
    eventId: input.eventId,
    layoutId: input.layoutId,
  }
}

function toClaimedEntry(input: {
  readonly claimOwner: string
  readonly entry: StoredEntry
}): CargoLayoutOutboxClaimedEntry {
  return {
    claimOwner: input.claimOwner,
    companyId: input.entry.companyId,
    correlationId: 'contract-test-correlation',
    eventId: input.entry.eventId,
    inputHash: INPUT_HASH,
    layoutId: input.entry.layoutId,
    occurredAt: now.toISOString(),
  }
}

/** A entrada reivindicada chega com campos a mais para provar que o relay não os propaga. */
function contaminate(entry: CargoLayoutOutboxClaimedEntry): CargoLayoutOutboxClaimedEntry {
  const contaminated: CargoLayoutOutboxClaimedEntry & {
    readonly input: Record<string, string>
    readonly stopLabel: string
  } = {
    ...entry,
    input: { customerName: 'Cliente da Parada Ltda' },
    stopLabel: 'Cliente da Parada Ltda',
  }

  return contaminated
}

function createOutboxRepository(input: {
  readonly calls?: string[]
  readonly contaminate?: boolean
  readonly entries: StoredEntry[]
}) {
  return {
    async claimDueEntries(params: {
      readonly claimOwner: string
      readonly leaseMs: number
      readonly limit: number
      readonly now: Date
    }): Promise<readonly CargoLayoutOutboxClaimedEntry[]> {
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

        return input.contaminate === true ? contaminate(claimed) : claimed
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
  readonly contaminate?: boolean
  readonly entries: StoredEntry[]
  readonly now?: Date
  readonly published: CargoLayoutEnvelopeV1[]
}): CargoLayoutOutboxRelayService {
  const clockNow = input.now ?? now

  return new CargoLayoutOutboxRelayService({
    clock: { now: () => clockNow },
    publisher: {
      async publish(params: { readonly envelope: CargoLayoutEnvelopeV1 }) {
        input.calls?.push(`publish:${params.envelope.eventId}`)
        input.published.push(params.envelope)
      },
    },
    repository: createOutboxRepository({
      ...(input.calls === undefined ? {} : { calls: input.calls }),
      ...(input.contaminate === undefined ? {} : { contaminate: input.contaminate }),
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
