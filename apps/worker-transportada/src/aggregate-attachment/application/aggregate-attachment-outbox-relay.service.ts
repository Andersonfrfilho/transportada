/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  AGGREGATE_ATTACHMENT_EVENT_TYPE,
  type AggregateAttachmentEnvelopeV1,
} from '../../messaging/aggregate-attachment-envelope.schema.js'
import type { AggregateAttachmentOutboxClaimedEntry } from '../infrastructure/drizzle-aggregate-attachment-outbox.repository.js'

type Clock = { now(): Date }

type Publisher = {
  publish(params: { readonly envelope: AggregateAttachmentEnvelopeV1 }): Promise<void>
}

type Repository = {
  claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly AggregateAttachmentOutboxClaimedEntry[]>
  markPublished(params: {
    readonly claimOwner: string
    readonly companyId: string
    readonly eventId: string
    readonly publishedAt: Date
  }): Promise<void>
}

type RetryPolicy = { classify(error: unknown): never }

export type RelayDueEntriesResult = {
  readonly claimedCount: number
  readonly publishedCount: number
}

export class AggregateAttachmentOutboxRelayService {
  readonly #clock: Clock
  readonly #publisher: Publisher
  readonly #repository: Repository
  readonly #retryPolicy: RetryPolicy

  constructor(dependencies: {
    readonly clock: Clock
    readonly publisher: Publisher
    readonly repository: Repository
    readonly retryPolicy: RetryPolicy
  }) {
    this.#clock = dependencies.clock
    this.#publisher = dependencies.publisher
    this.#repository = dependencies.repository
    this.#retryPolicy = dependencies.retryPolicy
  }

  async relayDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
  }): Promise<RelayDueEntriesResult> {
    const claimedEntries = await this.#repository.claimDueEntries({
      claimOwner: params.claimOwner,
      leaseMs: params.leaseMs,
      limit: params.limit,
      now: this.#clock.now(),
    })

    let publishedCount = 0

    for (const entry of claimedEntries) {
      if (entry.claimOwner !== params.claimOwner) continue

      try {
        await this.#publisher.publish({
          envelope: {
            companyId: entry.companyId,
            correlationId: entry.correlationId,
            eventId: entry.eventId,
            occurredAt: entry.occurredAt,
            payload: {
              attachmentId: entry.attachmentId,
              bucket: entry.bucket,
              objectKey: entry.objectKey,
              type: entry.type,
            },
            type: AGGREGATE_ATTACHMENT_EVENT_TYPE.EXTRACTION_REQUESTED,
            version: 1,
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
