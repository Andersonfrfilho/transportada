/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

import { JOB_RUN_QUEUE_ROUTE } from './job-run-envelope.schema.js'

type BuildJobRunRabbitMqTopologyParams = {
  readonly queuePrefix: string
}

/**
 * ⚠️ Os nomes têm de bater byte a byte com os que o cron declara ao publicar: fila é acordo de nome,
 * e uma letra de diferença faz o publicador criar a sua e o consumidor esperar para sempre na outra.
 *
 * O retry é o padrão dos outros trilhos — três tentativas de um em um minuto. A execução que esgotar
 * as três vai para a dead **com a linha ainda aberta**, e quem a fecha é a varredura de lease
 * vencido: é ela que separa "ninguém pegou" de "o processo morreu no meio".
 */
export function buildJobRunRabbitMqTopology(
  params: BuildJobRunRabbitMqTopologyParams,
): RabbitMqTopology {
  const routePrefix = `${params.queuePrefix}.${JOB_RUN_QUEUE_ROUTE}`

  return {
    exchange: `${routePrefix}.main.exchange`,
    queue: `${routePrefix}.main.queue`,
    routingKey: `${routePrefix}.main`,
    retry: {
      delayMs: 60_000,
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
