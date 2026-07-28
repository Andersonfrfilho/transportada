/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { buildMdfeIssuanceRabbitMqTopology } from '../src/messaging/mdfe-rabbitmq-topology.js'
import { buildCteIssuanceRabbitMqTopology } from '../src/messaging/cte-rabbitmq-topology.js'

describe('MDF-e RabbitMQ topology contract', () => {
  it('builds main/retry/dead-letter routes for manifest events', () => {
    const prefix = `transportada.contract.${crypto.randomUUID()}`
    const topology = buildMdfeIssuanceRabbitMqTopology({ queuePrefix: prefix })

    expect(topology).toEqual({
      exchange: `${prefix}.mdfe-issuance.v1.main.exchange`,
      queue: `${prefix}.mdfe-issuance.v1.main.queue`,
      routingKey: `${prefix}.mdfe-issuance.v1.main`,
      retry: {
        exchange: `${prefix}.mdfe-issuance.v1.retry.exchange`,
        queue: `${prefix}.mdfe-issuance.v1.retry.queue`,
        routingKey: `${prefix}.mdfe-issuance.v1.retry`,
        delayMs: 5000,
        maxRetries: 3,
      },
      deadLetter: {
        exchange: `${prefix}.mdfe-issuance.v1.dead.exchange`,
        queue: `${prefix}.mdfe-issuance.v1.dead.queue`,
        routingKey: `${prefix}.mdfe-issuance.v1.dead`,
      },
    })
  })

  it('never shares a queue with the CT-e rail', () => {
    const prefix = `transportada.contract.${crypto.randomUUID()}`
    const mdfe = buildMdfeIssuanceRabbitMqTopology({ queuePrefix: prefix })
    const cte = buildCteIssuanceRabbitMqTopology({ queuePrefix: prefix })

    const mdfeNames = [mdfe.queue, mdfe.retry?.queue, mdfe.deadLetter?.queue]
    const cteNames = [cte.queue, cte.retry?.queue, cte.deadLetter?.queue]

    expect(mdfeNames.some((name) => cteNames.includes(name))).toBe(false)
  })
})
