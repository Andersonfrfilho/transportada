/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

const NFE_IMPORT_RETRY_DELAY_MS = 5_000
const NFE_IMPORT_MAX_RETRIES = 3

type BuildNfeRabbitMqTopologyParams = {
  readonly queuePrefix: string
}

export function buildNfeImportRabbitMqTopology(
  params: BuildNfeRabbitMqTopologyParams,
): RabbitMqTopology {
  return buildNfeRabbitMqTopology({
    maxRetries: NFE_IMPORT_MAX_RETRIES,
    queuePrefix: params.queuePrefix,
    retryDelayMs: NFE_IMPORT_RETRY_DELAY_MS,
    routeName: 'nfe-import',
  })
}

export function buildNfeDistributionRabbitMqTopology(
  params: BuildNfeRabbitMqTopologyParams,
): RabbitMqTopology {
  return buildNfeRabbitMqTopology({
    maxRetries: NFE_IMPORT_MAX_RETRIES,
    queuePrefix: params.queuePrefix,
    retryDelayMs: NFE_IMPORT_RETRY_DELAY_MS,
    routeName: 'nfe-distribution',
  })
}

function buildNfeRabbitMqTopology(params: {
  readonly maxRetries: number
  readonly queuePrefix: string
  readonly retryDelayMs: number
  readonly routeName: 'nfe-import' | 'nfe-distribution'
}): RabbitMqTopology {
  const routePrefix = `${params.queuePrefix}.${params.routeName}.v1`

  return {
    exchange: `${routePrefix}.main.exchange`,
    queue: `${routePrefix}.main.queue`,
    routingKey: `${routePrefix}.main`,
    retry: {
      delayMs: params.retryDelayMs,
      exchange: `${routePrefix}.retry.exchange`,
      maxRetries: params.maxRetries,
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
