/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'
import { buildRabbitMqTopology } from '../src/messaging/rabbitmq-topology.js'

describe('worker RabbitMQ topology contract', () => {
  it('builds isolated main, retry and dead-letter routes', () => {
    const prefix = `transportada.contract.${crypto.randomUUID()}`
    const topology = buildRabbitMqTopology(prefix)

    expect(topology).toEqual({
      exchange: `${prefix}.main.exchange`,
      queue: `${prefix}.main.queue`,
      routingKey: `${prefix}.main.v1`,
      retry: {
        exchange: `${prefix}.retry.exchange`,
        queue: `${prefix}.retry.queue`,
        routingKey: `${prefix}.retry.v1`,
        delayMs: 100,
        maxRetries: 2,
      },
      deadLetter: {
        exchange: `${prefix}.dead.exchange`,
        queue: `${prefix}.dead.queue`,
        routingKey: `${prefix}.dead.v1`,
      },
    })
  })
})
