/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

const NFE_ACCESS_KEY_RETRY_DELAY_MS = 5_000
const NFE_ACCESS_KEY_MAX_RETRIES = 3

export function buildNfeAccessKeyRabbitMqTopology(params: {
  readonly queuePrefix: string
}): RabbitMqTopology {
  const routePrefix = `${params.queuePrefix}.nfe-access-key.v1`

  return {
    exchange: `${routePrefix}.main.exchange`,
    queue: `${routePrefix}.main.queue`,
    routingKey: `${routePrefix}.main`,
    retry: {
      delayMs: NFE_ACCESS_KEY_RETRY_DELAY_MS,
      exchange: `${routePrefix}.retry.exchange`,
      maxRetries: NFE_ACCESS_KEY_MAX_RETRIES,
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
