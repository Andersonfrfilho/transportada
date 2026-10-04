/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import type { CargoPreviewEnvelopeV1 } from '../../messaging/cargo-preview-envelope.schema.js'
import type { CargoPreviewOutboxClaimedEntry } from '../infrastructure/drizzle-cargo-preview-outbox.repository.js'

type Repository = {
  claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly CargoPreviewOutboxClaimedEntry[]>
  markPublished(params: {
    readonly claimOwner: string
    readonly companyId: string
    readonly eventId: string
    readonly publishedAt: Date
  }): Promise<void>
}

type Publisher = { publish(envelope: CargoPreviewEnvelopeV1): Promise<void> }

export function createCargoPreviewOutboxPublisher(provider: RabbitMqProvider): Publisher {
  return {
    async publish(envelope) {
      await provider.publish(envelope, {
        correlationId: envelope.correlationId,
        messageId: envelope.eventId,
        type: envelope.type,
      })
    },
  }
}

/** Publica o que venceu e marca; falha de publicação sobe para o laço do relay tentar de novo. */
export class CargoPreviewOutboxRelayService {
  readonly #now: () => Date
  readonly #publisher: Publisher
  readonly #repository: Repository

  constructor(dependencies: {
    readonly now: () => Date
    readonly publisher: Publisher
    readonly repository: Repository
  }) {
    this.#now = dependencies.now
    this.#publisher = dependencies.publisher
    this.#repository = dependencies.repository
  }

  async relayDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
  }): Promise<{ readonly claimedCount: number; readonly publishedCount: number }> {
    const entries = await this.#repository.claimDueEntries({ ...params, now: this.#now() })
    let publishedCount = 0
    for (const entry of entries) {
      if (entry.claimOwner !== params.claimOwner) continue
      await this.#publisher.publish(entry.envelope)
      await this.#repository.markPublished({
        claimOwner: params.claimOwner,
        companyId: entry.envelope.companyId,
        eventId: entry.envelope.eventId,
        publishedAt: this.#now(),
      })
      publishedCount += 1
    }
    return { claimedCount: entries.length, publishedCount }
  }
}
