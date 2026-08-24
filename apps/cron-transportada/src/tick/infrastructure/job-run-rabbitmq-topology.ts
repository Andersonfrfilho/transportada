/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

import { JOB_RUN_QUEUE_ROUTE } from '../domain/tick.constant.js'

type BuildJobRunRabbitMqTopologyParams = {
  readonly queuePrefix: string
}

/**
 * Três tentativas com um minuto de espera: o pedido de ciclo é barato de repetir, e a rotina que
 * falhar de verdade tem o vocabulário dela para dizer por quê — insistir aqui só adiaria a resposta
 * na tela. Acima disso a mensagem vai para a dead, onde a janela seguinte já a substituiu.
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
