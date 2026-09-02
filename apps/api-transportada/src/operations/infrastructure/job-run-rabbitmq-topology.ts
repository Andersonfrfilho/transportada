/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

/**
 * ⚠️ **Terceira cópia por valor desta topologia** — as outras duas estão no cron (que publica pela
 * batida) e no worker (que consome). As apps não importam código umas das outras, e agora a API
 * também publica: é o botão de rodar agora (spec 072).
 *
 * Fila é acordo de nome, e uma letra de diferença faz o publicador criar a sua e o consumidor
 * esperar para sempre na outra — por isso a paridade é assertada em contrato, não suposta.
 */
export const JOB_RUN_QUEUE_ROUTE = 'job-run.v1'
export const JOB_RUN_EVENT_TYPE = 'transportada.job.run.requested'

export function buildJobRunRabbitMqTopology(params: {
  readonly queuePrefix: string
}): RabbitMqTopology {
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
