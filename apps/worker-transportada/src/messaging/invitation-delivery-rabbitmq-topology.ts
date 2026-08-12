/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

type BuildInvitationDeliveryRabbitMqTopologyParams = {
  readonly queuePrefix: string
}

/**
 * Entrega de código de convite: janela curta de validade, então o retry é mais agressivo que o dos
 * trilhos fiscais — de nada serve reentregar depois que o convite expirou.
 */
export function buildInvitationDeliveryRabbitMqTopology(
  params: BuildInvitationDeliveryRabbitMqTopologyParams,
): RabbitMqTopology {
  const routePrefix = `${params.queuePrefix}.invitation-delivery.v1`

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
