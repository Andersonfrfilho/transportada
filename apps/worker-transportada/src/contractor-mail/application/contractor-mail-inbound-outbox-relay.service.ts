/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  CONTRACTOR_MAIL_INBOUND_EVENT_TYPE,
  type ContractorMailInboundEnvelopeV1,
} from '../../messaging/contractor-mail-inbound-envelope.schema.js'
import type { ContractorMailInboundOutboxClaimedEntry } from '../infrastructure/drizzle-contractor-mail-inbound-outbox.repository.js'

type Clock = { now(): Date }

type Publisher = {
  publish(params: { readonly envelope: ContractorMailInboundEnvelopeV1 }): Promise<void>
}

type Repository = {
  claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly ContractorMailInboundOutboxClaimedEntry[]>
  markPublished(params: {
    readonly claimOwner: string
    readonly companyId: string
    readonly eventId: string
    readonly publishedAt: Date
  }): Promise<void>
}

type RetryPolicy = { classify(error: unknown): never }

export type ContractorMailInboundRelayDueEntriesResult = {
  readonly claimedCount: number
  readonly publishedCount: number
}

export class ContractorMailInboundOutboxRelayService {
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
  }): Promise<ContractorMailInboundRelayDueEntriesResult> {
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
            payload: { providerEmailId: entry.providerEmailId },
            type: CONTRACTOR_MAIL_INBOUND_EVENT_TYPE.EMAIL_RECEIVED,
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
