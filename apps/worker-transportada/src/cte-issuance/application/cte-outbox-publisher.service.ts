/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import type { CteProcessingEnvelopeV1 } from '../../messaging/cte-processing-envelope.schema.js'

type PublishParams = {
  readonly envelope: CteProcessingEnvelopeV1
}

export class CteOutboxPublisherService {
  readonly #provider: RabbitMqProvider

  constructor(provider: RabbitMqProvider) {
    this.#provider = provider
  }

  async publish(params: PublishParams): Promise<void> {
    await this.#provider.publish(params.envelope, {
      correlationId: params.envelope.correlationId,
      messageId: params.envelope.eventId,
      type: params.envelope.type,
    })
  }
}
