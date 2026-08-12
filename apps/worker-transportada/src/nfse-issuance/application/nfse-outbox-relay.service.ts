/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseProcessingEnvelopeV1 } from '../../messaging/nfse-processing-envelope.schema.js'
import type { NfseOutboxClaimedEntry } from '../infrastructure/drizzle-nfse-outbox.repository.js'

type Clock = {
  now(): Date
}

type NfseOutboxPublisher = {
  publish(params: { readonly envelope: NfseProcessingEnvelopeV1 }): Promise<void>
}

type NfseOutboxRepository = {
  claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly NfseOutboxClaimedEntry[]>
  markPublished(params: {
    readonly claimOwner: string
    readonly companyId: string
    readonly eventId: string
    readonly publishedAt: Date
  }): Promise<void>
}

type RetryPolicy = {
  classify(error: unknown): never
}

type NfseOutboxRelayServiceDependencies = {
  readonly clock: Clock
  readonly publisher: NfseOutboxPublisher
  readonly repository: NfseOutboxRepository
  readonly retryPolicy: RetryPolicy
}

export type RelayDueEntriesParams = {
  readonly claimOwner: string
  readonly leaseMs: number
  readonly limit: number
}

export type RelayDueEntriesResult = {
  readonly claimedCount: number
  readonly publishedCount: number
}

export class NfseOutboxRelayService {
  readonly #clock: Clock
  readonly #publisher: NfseOutboxPublisher
  readonly #repository: NfseOutboxRepository
  readonly #retryPolicy: RetryPolicy

  constructor(dependencies: NfseOutboxRelayServiceDependencies) {
    this.#clock = dependencies.clock
    this.#publisher = dependencies.publisher
    this.#repository = dependencies.repository
    this.#retryPolicy = dependencies.retryPolicy
  }

  async relayDueEntries(params: RelayDueEntriesParams): Promise<RelayDueEntriesResult> {
    const claimedEntries = await this.#repository.claimDueEntries({
      claimOwner: params.claimOwner,
      leaseMs: params.leaseMs,
      limit: params.limit,
      now: this.#clock.now(),
    })

    let publishedCount = 0

    for (const entry of claimedEntries) {
      if (entry.claimOwner !== params.claimOwner) {
        continue
      }

      try {
        await this.#publisher.publish({
          envelope: {
            actorId: entry.actorId,
            companyId: entry.companyId,
            correlationId: entry.correlationId,
            eventId: entry.eventId,
            occurredAt: entry.occurredAt,
            payload: {
              attemptFingerprint: entry.attemptFingerprint,
              attemptId: entry.attemptId,
              attemptKind: entry.attemptKind,
              invoiceId: entry.invoiceId,
              status: entry.status,
            },
            type: entry.eventType,
            version: entry.eventVersion,
          },
        })
      } catch (error: unknown) {
        this.#retryPolicy.classify(error)
      }

      await this.#repository.markPublished({
        claimOwner: params.claimOwner,
        companyId: entry.companyId,
        eventId: entry.eventId,
        publishedAt: this.#clock.now(),
      })
      publishedCount += 1
    }

    return { claimedCount: claimedEntries.length, publishedCount }
  }
}
