/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import type { AggregateAttachmentEnvelopeV1 } from '../../messaging/aggregate-attachment-envelope.schema.js'

export class AggregateAttachmentOutboxPublisherService {
  readonly #provider: RabbitMqProvider

  constructor(provider: RabbitMqProvider) {
    this.#provider = provider
  }

  async publish(params: { readonly envelope: AggregateAttachmentEnvelopeV1 }): Promise<void> {
    await this.#provider.publish(params.envelope, {
      correlationId: params.envelope.correlationId,
      messageId: params.envelope.eventId,
      type: params.envelope.type,
    })
  }
}
