/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

type BuildCargoLayoutTopologyParams = {
  readonly queuePrefix: string
}

/**
 * Spec 145 D8: a planta de carga é trabalho de worker, na mesma trilha da roteirização — main, retry
 * de 30 s, dead-letter. Duas tentativas: a entrada é a mesma a cada vez, então um cálculo que falhou
 * por erro da política falha de novo; o retry só cobre o transitório (banco, thread morta).
 */
export function buildCargoLayoutTopology(params: BuildCargoLayoutTopologyParams): RabbitMqTopology {
  const routePrefix = `${params.queuePrefix}.cargo-layout.v1`

  return {
    exchange: `${routePrefix}.main.exchange`,
    queue: `${routePrefix}.main.queue`,
    routingKey: `${routePrefix}.main`,
    retry: {
      delayMs: 30_000,
      exchange: `${routePrefix}.retry.exchange`,
      maxRetries: 2,
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
