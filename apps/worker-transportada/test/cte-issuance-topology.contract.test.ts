/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { buildCteIssuanceRabbitMqTopology } from '../src/messaging/cte-rabbitmq-topology.js'

describe('CT-e RabbitMQ topology contract', () => {
  it('builds main/retry/dead-letter routes for issuance events', () => {
    const prefix = `transportada.contract.${crypto.randomUUID()}`
    const topology = buildCteIssuanceRabbitMqTopology({
      queuePrefix: prefix,
    })

    expect(topology).toEqual({
      exchange: `${prefix}.cte-issuance.v1.main.exchange`,
      queue: `${prefix}.cte-issuance.v1.main.queue`,
      routingKey: `${prefix}.cte-issuance.v1.main`,
      retry: {
        exchange: `${prefix}.cte-issuance.v1.retry.exchange`,
        queue: `${prefix}.cte-issuance.v1.retry.queue`,
        routingKey: `${prefix}.cte-issuance.v1.retry`,
        delayMs: 5000,
        maxRetries: 3,
      },
      deadLetter: {
        exchange: `${prefix}.cte-issuance.v1.dead.exchange`,
        queue: `${prefix}.cte-issuance.v1.dead.queue`,
        routingKey: `${prefix}.cte-issuance.v1.dead`,
      },
    })
  })
})
