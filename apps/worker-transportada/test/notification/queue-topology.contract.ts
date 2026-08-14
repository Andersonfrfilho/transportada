/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { buildNotificationRabbitMqTopology } from '../../src/messaging/notification-rabbitmq-topology.js'

/**
 * ⚠️ Estes nomes são os mesmos fixados em `apps/api-transportada/test/notification/queue.contract.ts`.
 * A API publica e o worker consome; um nome que divirja produz duas trilhas que nunca se encontram,
 * e a entrega some sem erro nenhum. As duas apps não importam código uma da outra — o que guarda a
 * paridade é este par de contratos.
 */
describe('contrato do nome das filas de notificação no worker', () => {
  test('a trilha é a mesma que a API publica', () => {
    const topology = buildNotificationRabbitMqTopology({ queuePrefix: 'transportada_test' })

    expect(topology.exchange).toBe('transportada_test.notification.v1.main.exchange')
    expect(topology.queue).toBe('transportada_test.notification.v1.main.queue')
    expect(topology.routingKey).toBe('transportada_test.notification.v1.main')
    expect(topology.retry.exchange).toBe('transportada_test.notification.v1.retry.exchange')
    expect(topology.retry.queue).toBe('transportada_test.notification.v1.retry.queue')
    expect(topology.retry.routingKey).toBe('transportada_test.notification.v1.retry')
    expect(topology.deadLetter.exchange).toBe('transportada_test.notification.v1.dead.exchange')
    expect(topology.deadLetter.queue).toBe('transportada_test.notification.v1.dead.queue')
    expect(topology.deadLetter.routingKey).toBe('transportada_test.notification.v1.dead')
  })

  test('o prefixo é do ambiente, não literal', () => {
    expect(
      buildNotificationRabbitMqTopology({ queuePrefix: 'outro_prefixo' }).queue.startsWith(
        'outro_prefixo.',
      ),
    ).toBe(true)
  })
})
