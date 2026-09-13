/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE,
  type ContractorMailOutboundEnvelopeV1,
} from '../../messaging/contractor-mail-outbound-envelope.schema.js'
import type { ContractorMailOutboundOutboxClaimedEntry } from '../infrastructure/drizzle-contractor-mail-outbound-outbox.repository.js'

type Clock = { now(): Date }

type Publisher = {
  publish(params: { readonly envelope: ContractorMailOutboundEnvelopeV1 }): Promise<void>
}

type Repository = {
  claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly ContractorMailOutboundOutboxClaimedEntry[]>
  markPublished(params: {
    readonly claimOwner: string
    readonly companyId: string
    readonly eventId: string
    readonly publishedAt: Date
  }): Promise<void>
}

type RetryPolicy = { classify(error: unknown): never }

export type ContractorMailOutboundRelayDueEntriesResult = {
  readonly claimedCount: number
  readonly publishedCount: number
}

export class ContractorMailOutboundOutboxRelayService {
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
  }): Promise<ContractorMailOutboundRelayDueEntriesResult> {
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
              messageId: entry.messageId,
              replyToAddress: entry.replyToAddress,
              toAddress: entry.toAddress,
            },
            type: CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE.MESSAGE_SEND_REQUESTED,
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
