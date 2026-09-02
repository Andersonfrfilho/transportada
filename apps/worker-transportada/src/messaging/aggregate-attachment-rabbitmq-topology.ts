/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

export function buildAggregateAttachmentRabbitMqTopology(params: {
  readonly queuePrefix: string
}): RabbitMqTopology {
  const routePrefix = `${params.queuePrefix}.aggregate-attachment.v1`

  return {
    exchange: `${routePrefix}.main.exchange`,
    queue: `${routePrefix}.main.queue`,
    routingKey: `${routePrefix}.main`,
    retry: {
      delayMs: 5_000,
      exchange: `${routePrefix}.retry.exchange`,
      maxRetries: 3,
      queue: `${routePrefix}.retry.queue`,
      routingKey: `${routePrefix}.retry`,
    },
    deadLetter: {
      exchange: `${routePrefix}.dead.exchange`,
      queue: `${routePrefix}.dead.queue`,
      routingKey: `${routePrefix}.dead`,
    },
  }
}
