/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import type { InvitationDeliveryEnvelopeV1 } from '../../messaging/invitation-delivery-envelope.schema.js'

export class InvitationDeliveryOutboxPublisherService {
  readonly #provider: RabbitMqProvider

  constructor(provider: RabbitMqProvider) {
    this.#provider = provider
  }

  async publish(params: { readonly envelope: InvitationDeliveryEnvelopeV1 }): Promise<void> {
    await this.#provider.publish(params.envelope, {
      correlationId: params.envelope.correlationId,
      messageId: params.envelope.eventId,
      type: params.envelope.type,
    })
  }
}
