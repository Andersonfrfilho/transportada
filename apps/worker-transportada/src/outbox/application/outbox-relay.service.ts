/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

import type { NfeProcessingEnvelopeV1 } from '../../messaging/nfe-processing-envelope.schema.js'

type ProcessingEventType =
  | 'transportada.nfe.import.requested'
  | 'transportada.nfe.distribution.requested'

type ClaimedOutboxEntry = {
  readonly actorId: string
  readonly claimOwner: string
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly eventType: ProcessingEventType
  readonly importId: string
  readonly occurredAt: string
  readonly version: 1
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
  publish(params: {
    readonly envelope: NfeProcessingEnvelopeV1
    readonly topology: RabbitMqTopology
  }): Promise<void>
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

type OutboxRelayTopologyResolver = {
  resolve(params: { readonly eventType: ProcessingEventType }): RabbitMqTopology
}

export class OutboxRelayService {
  readonly #clock: OutboxRelayClock
  readonly #publisher: OutboxRelayPublisher
  readonly #repository: OutboxRelayRepository
  readonly #retryPolicy: OutboxRelayRetryPolicy
  readonly #topologyResolver: OutboxRelayTopologyResolver

  constructor(params: {
    readonly clock: OutboxRelayClock
    readonly publisher: OutboxRelayPublisher
    readonly repository: OutboxRelayRepository
    readonly retryPolicy: OutboxRelayRetryPolicy
    readonly topologyResolver: OutboxRelayTopologyResolver
  }) {
    this.#clock = params.clock
    this.#publisher = params.publisher
    this.#repository = params.repository
    this.#retryPolicy = params.retryPolicy
    this.#topologyResolver = params.topologyResolver
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
              importId: entry.importId,
            },
            type: entry.eventType,
            version: entry.version,
          },
          topology: this.#topologyResolver.resolve({
            eventType: entry.eventType,
          }),
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
