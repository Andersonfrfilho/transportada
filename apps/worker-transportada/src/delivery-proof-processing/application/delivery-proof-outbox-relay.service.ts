/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import type { DeliveryProofProcessingEnvelopeV1 } from '../../messaging/delivery-proof-processing-envelope.schema.js'
import { DELIVERY_PROOF_PROCESSING_EVENT_TYPE } from '../domain/delivery-proof-processing.constant.js'
import type { DeliveryProofOutboxClaimedEntry } from '../infrastructure/drizzle-delivery-proof-outbox.repository.js'

type Clock = { now(): Date }

type Publisher = {
  publish(params: { readonly envelope: DeliveryProofProcessingEnvelopeV1 }): Promise<void>
}

type Repository = {
  claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly DeliveryProofOutboxClaimedEntry[]>
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

export class DeliveryProofOutboxPublisherService {
  readonly #provider: RabbitMqProvider

  constructor(provider: RabbitMqProvider) {
    this.#provider = provider
  }

  async publish(params: { readonly envelope: DeliveryProofProcessingEnvelopeV1 }): Promise<void> {
    await this.#provider.publish(params.envelope, {
      correlationId: params.envelope.correlationId,
      messageId: params.envelope.eventId,
      type: params.envelope.type,
    })
  }
}

/** Spec 265 RF4: o relay do trilho do comprovante, no molde do anexo do agregado (070). */
export class DeliveryProofOutboxRelayService {
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
              attachmentKey: entry.attachmentKey,
              objectKey: entry.objectKey,
              proofId: entry.proofId,
              variant: entry.variant,
            },
            type: DELIVERY_PROOF_PROCESSING_EVENT_TYPE.REQUESTED,
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
