/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

const RETRY_DELAY_MS = 100
const MAX_RETRIES = 2

export function buildRabbitMqTopology(prefix: string): RabbitMqTopology {
  return {
    exchange: `${prefix}.main.exchange`,
    queue: `${prefix}.main.queue`,
    routingKey: `${prefix}.main.v1`,
    retry: {
      delayMs: RETRY_DELAY_MS,
      exchange: `${prefix}.retry.exchange`,
      maxRetries: MAX_RETRIES,
      queue: `${prefix}.retry.queue`,
      routingKey: `${prefix}.retry.v1`,
    },
    deadLetter: {
      exchange: `${prefix}.dead.exchange`,
      queue: `${prefix}.dead.queue`,
      routingKey: `${prefix}.dead.v1`,
    },
  }
}
