/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { buildNfeImportRabbitMqTopology } from '../../src/messaging/nfe-rabbitmq-topology.js'

describe('NF-e RabbitMQ topology contract', () => {
  it('builds versioned import routes with main, retry, DLX and DLQ isolated by prefix', () => {
    const queuePrefix = `transportada.contract.${crypto.randomUUID()}`
    const topology = buildNfeImportRabbitMqTopology({ queuePrefix })

    expect(topology).toEqual({
      exchange: `${queuePrefix}.nfe-import.v1.main.exchange`,
      queue: `${queuePrefix}.nfe-import.v1.main.queue`,
      routingKey: `${queuePrefix}.nfe-import.v1.main`,
      retry: {
        exchange: `${queuePrefix}.nfe-import.v1.retry.exchange`,
        queue: `${queuePrefix}.nfe-import.v1.retry.queue`,
        routingKey: `${queuePrefix}.nfe-import.v1.retry`,
        delayMs: 5_000,
        maxRetries: 3,
      },
      deadLetter: {
        exchange: `${queuePrefix}.nfe-import.v1.dead.exchange`,
        queue: `${queuePrefix}.nfe-import.v1.dead.queue`,
        routingKey: `${queuePrefix}.nfe-import.v1.dead`,
      },
    })
  })
})
