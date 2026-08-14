/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

import { NOTIFICATION_QUEUE_ROUTE } from '../notification/notification.constant.js'

type BuildNotificationRabbitMqTopologyParams = {
  readonly queuePrefix: string
}

/**
 * Entrega de notificação é barata de repetir e cara de perder: cinco tentativas com meio minuto de
 * espera cobrem a queda curta do provedor de e-mail sem segurar a fila por horas.
 */
export function buildNotificationRabbitMqTopology(
  params: BuildNotificationRabbitMqTopologyParams,
): RabbitMqTopology {
  const routePrefix = `${params.queuePrefix}.${NOTIFICATION_QUEUE_ROUTE}`

  return {
    exchange: `${routePrefix}.main.exchange`,
    queue: `${routePrefix}.main.queue`,
    routingKey: `${routePrefix}.main`,
    retry: {
      delayMs: 30_000,
      exchange: `${routePrefix}.retry.exchange`,
      maxRetries: 5,
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
