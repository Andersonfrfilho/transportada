/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import type { ContractorMailOutboundEnvelopeV1 } from '../../messaging/contractor-mail-outbound-envelope.schema.js'

export class ContractorMailOutboundOutboxPublisherService {
  readonly #provider: RabbitMqProvider

  constructor(provider: RabbitMqProvider) {
    this.#provider = provider
  }

  async publish(params: { readonly envelope: ContractorMailOutboundEnvelopeV1 }): Promise<void> {
    await this.#provider.publish(params.envelope, {
      correlationId: params.envelope.correlationId,
      messageId: params.envelope.eventId,
      type: params.envelope.type,
    })
  }
}
