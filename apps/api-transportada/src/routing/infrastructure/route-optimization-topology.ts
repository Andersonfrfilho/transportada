/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

type BuildRouteOptimizationTopologyParams = {
  readonly queuePrefix: string
}

/**
 * ADR-0044 §7: otimizar é trabalho de worker, sempre — um GA sobre 200 paradas roda por dezenas de
 * segundos, e dentro do `Bun.serve` isso bloqueia o event loop e derruba o resto da API.
 *
 * A trilha é a mesma que CT-e e MDF-e já usam: main, retry com TTL, dead-letter. Nada de padrão novo.
 *
 * Duas tentativas, não três: uma otimização que falhou por falta de matriz vai falhar de novo pelo
 * mesmo motivo, e a fila é o lugar errado para insistir — quem insiste é o conferente, pedindo de
 * novo depois que o OSRM voltar.
 */
export function buildRouteOptimizationTopology(
  params: BuildRouteOptimizationTopologyParams,
): RabbitMqTopology {
  const routePrefix = `${params.queuePrefix}.route-optimization.v1`

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
