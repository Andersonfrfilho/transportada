/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

type BuildPasswordResetDeliveryRabbitMqTopologyParams = {
  readonly queuePrefix: string
}

/**
 * Janela ainda mais curta que a do convite — quinze minutos, com a pessoa na frente da tela — então
 * o retry é o mesmo do trilho de convite: reentregar depois que o código expirou não serve a ninguém.
 */
export function buildPasswordResetDeliveryRabbitMqTopology(
  params: BuildPasswordResetDeliveryRabbitMqTopologyParams,
): RabbitMqTopology {
  const routePrefix = `${params.queuePrefix}.password-reset-delivery.v1`

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
