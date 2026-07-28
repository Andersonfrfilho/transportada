/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteProcessingEnvelopeV1 } from '../../messaging/cte-processing-envelope.schema.js'

type CteOutboxEventType =
  | 'transportada.cte.item.issue.requested'
  | 'transportada.cte.item.cancel.requested'

type ClaimedOutboxEntry = {
  readonly actorId: string
  readonly attemptFingerprint: string
  readonly attemptId: string
  readonly claimOwner: string
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly eventType: CteOutboxEventType
  readonly aggregateId: string
  readonly aggregateType: string
  readonly aggregateSubtype: string
  readonly batchId: string
  readonly batchItemId: string
  readonly attemptKind: 'issue' | 'reprocess' | 'cancel'
  readonly eventVersion: 1
  readonly occurredAt: string
  readonly payload: {
    readonly batchItemId: string
    readonly batchId: string
    readonly attemptKind: 'issue' | 'reprocess' | 'cancel'
    readonly status: string
    readonly attemptFingerprint: string
    readonly attemptId: string
  }
}

type RelayDueEntriesParams = {
  readonly claimOwner: string
  readonly leaseMs: number
  readonly limit: number
}

type RelayDueEntriesResult = {
  readonly claimedCount: number
  readonly publishedCount: number
}

type OutboxRelayClock = {
  now(): Date
}

type OutboxRelayPublisher = {
  publish(params: { readonly envelope: CteProcessingEnvelopeV1 }): Promise<void>
}

type OutboxRelayRepository = {
  claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly ClaimedOutboxEntry[]>
  markPublished(params: {
    readonly claimOwner: string
    readonly companyId: string
    readonly eventId: string
    readonly publishedAt: Date
  }): Promise<void>
}

type OutboxRelayRetryPolicy = {
  classify(error: unknown): never
}

export class CteOutboxRelayService {
  readonly #clock: OutboxRelayClock
  readonly #publisher: OutboxRelayPublisher
  readonly #repository: OutboxRelayRepository
  readonly #retryPolicy: OutboxRelayRetryPolicy

  constructor(params: {
    readonly clock: OutboxRelayClock
    readonly publisher: OutboxRelayPublisher
    readonly repository: OutboxRelayRepository
    readonly retryPolicy: OutboxRelayRetryPolicy
  }) {
    this.#clock = params.clock
    this.#publisher = params.publisher
    this.#repository = params.repository
    this.#retryPolicy = params.retryPolicy
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
              batchItemId: entry.batchItemId,
              batchId: entry.batchId,
              attemptId: entry.attemptId,
              attemptFingerprint: entry.attemptFingerprint,
              attemptKind: entry.attemptKind,
              status: entry.payload.status,
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

    return {
      claimedCount: claimedEntries.length,
      publishedCount,
    }
  }
}
