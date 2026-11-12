/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqProvider, RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

import type { NfeAccessKeyEnvelopeV1 } from '../../messaging/nfe-access-key-envelope.schema.js'
import type { NfeProcessingEnvelopeV1 } from '../../messaging/nfe-processing-envelope.schema.js'

export class NfeOutboxPublisherService {
  readonly #accessKeyProvider: RabbitMqProvider
  readonly #accessKeyTopology: RabbitMqTopology
  readonly #distributionProvider: RabbitMqProvider
  readonly #distributionTopology: RabbitMqTopology
  readonly #importProvider: RabbitMqProvider
  readonly #importTopology: RabbitMqTopology

  constructor(params: {
    readonly accessKeyProvider: RabbitMqProvider
    readonly accessKeyTopology: RabbitMqTopology
    readonly distributionProvider: RabbitMqProvider
    readonly distributionTopology: RabbitMqTopology
    readonly importProvider: RabbitMqProvider
    readonly importTopology: RabbitMqTopology
  }) {
    this.#accessKeyProvider = params.accessKeyProvider
    this.#accessKeyTopology = params.accessKeyTopology
    this.#distributionProvider = params.distributionProvider
    this.#distributionTopology = params.distributionTopology
    this.#importProvider = params.importProvider
    this.#importTopology = params.importTopology
  }

  async publish(params: {
    readonly envelope: NfeProcessingEnvelopeV1 | NfeAccessKeyEnvelopeV1
    readonly topology: RabbitMqTopology
  }): Promise<void> {
    const provider = this.resolveProvider(params.topology)

    await provider.publish(params.envelope, {
      correlationId: params.envelope.correlationId,
      messageId: params.envelope.eventId,
      type: params.envelope.type,
    })
  }

  resolveProvider(topology: RabbitMqTopology): RabbitMqProvider {
    if (topology.queue === this.#importTopology.queue) {
      return this.#importProvider
    }
    if (topology.queue === this.#distributionTopology.queue) {
      return this.#distributionProvider
    }

    if (topology.queue === this.#accessKeyTopology.queue) {
      return this.#accessKeyProvider
    }

    throw new Error(`Unsupported NF-e topology queue: ${topology.queue}`)
  }
}
