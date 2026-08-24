/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import type { JobRunPublisherPort } from '../application/job-run-publisher.port.js'

type CreateRabbitMqJobRunPublisherDependencies = {
  readonly provider: RabbitMqProvider
}

export function createRabbitMqJobRunPublisher(
  dependencies: CreateRabbitMqJobRunPublisherDependencies,
): JobRunPublisherPort {
  return {
    async publish({ envelope }) {
      await dependencies.provider.publish(envelope, {
        correlationId: envelope.correlationId,
        messageId: envelope.eventId,
        type: envelope.type,
      })
    },
  }
}
