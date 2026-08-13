/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { PasswordResetDeliveryEnvelopeV1 } from '../../messaging/password-reset-delivery-envelope.schema.js'
import type { PasswordResetDeliveryClaimedEntry } from '../infrastructure/drizzle-password-reset-delivery-outbox.repository.js'

type Clock = { now(): Date }

type Publisher = {
  publish(params: { readonly envelope: PasswordResetDeliveryEnvelopeV1 }): Promise<void>
}

type Repository = {
  claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly PasswordResetDeliveryClaimedEntry[]>
  markPublished(params: {
    readonly claimOwner: string
    readonly companyId: string
    readonly eventId: string
    readonly publishedAt: Date
  }): Promise<void>
}

type RetryPolicy = { classify(error: unknown): never }

export type PasswordResetRelayDueEntriesResult = {
  readonly claimedCount: number
  readonly publishedCount: number
}

/** O envelope é montado das colunas tipadas: nada além da referência atravessa o broker. */
export class PasswordResetDeliveryOutboxRelayService {
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
  }): Promise<PasswordResetRelayDueEntriesResult> {
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
            payload: { requestId: entry.requestId, userId: entry.userId },
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
