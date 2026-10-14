/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

/**
 * Spec 265: o trilho do tratamento do comprovante. O retry espera 15 s: a falha típica é banco ou
 * storage fora, e a foto de 12 MiB não ganha nada com pressa — o motorista já confirmou a entrega.
 */
export function buildDeliveryProofProcessingRabbitMqTopology(params: {
  readonly queuePrefix: string
}): RabbitMqTopology {
  const routePrefix = `${params.queuePrefix}.delivery-proof-processing.v1`

  return {
    exchange: `${routePrefix}.main.exchange`,
    queue: `${routePrefix}.main.queue`,
    routingKey: `${routePrefix}.main`,
    retry: {
      delayMs: 15_000,
      exchange: `${routePrefix}.retry.exchange`,
      maxRetries: 4,
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
