/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'
import type { RabbitMqTopology } from '@adatechnology/rabbitmq-provider'

import { buildCteIssuanceRabbitMqTopology } from '../src/messaging/cte-rabbitmq-topology.js'
import { buildMdfeIssuanceRabbitMqTopology } from '../src/messaging/mdfe-rabbitmq-topology.js'
import {
  buildNfeDistributionRabbitMqTopology,
  buildNfeImportRabbitMqTopology,
} from '../src/messaging/nfe-rabbitmq-topology.js'
import { buildNfseIssuanceRabbitMqTopology } from '../src/messaging/nfse-rabbitmq-topology.js'
import { buildRabbitMqTopology } from '../src/messaging/rabbitmq-topology.js'

function collectRouteNames(topology: RabbitMqTopology): readonly string[] {
  return [
    topology.exchange,
    topology.queue,
    topology.retry?.exchange,
    topology.retry?.queue,
    topology.deadLetter?.exchange,
    topology.deadLetter?.queue,
  ].filter((name): name is string => typeof name === 'string')
}

describe('NFS-e RabbitMQ topology contract', () => {
  it('builds main/retry/dead-letter routes for service invoice events', () => {
    const prefix = `transportada.contract.${crypto.randomUUID()}`
    const topology = buildNfseIssuanceRabbitMqTopology({ queuePrefix: prefix })

    expect(topology).toEqual({
      exchange: `${prefix}.nfse-issuance.v1.main.exchange`,
      queue: `${prefix}.nfse-issuance.v1.main.queue`,
      routingKey: `${prefix}.nfse-issuance.v1.main`,
      retry: {
        exchange: `${prefix}.nfse-issuance.v1.retry.exchange`,
        queue: `${prefix}.nfse-issuance.v1.retry.queue`,
        routingKey: `${prefix}.nfse-issuance.v1.retry`,
        delayMs: 5000,
        maxRetries: 3,
      },
      deadLetter: {
        exchange: `${prefix}.nfse-issuance.v1.dead.exchange`,
        queue: `${prefix}.nfse-issuance.v1.dead.queue`,
        routingKey: `${prefix}.nfse-issuance.v1.dead`,
      },
    })
  })

  it('keeps every route under the versioned nfse-issuance prefix', () => {
    const prefix = `transportada.contract.${crypto.randomUUID()}`
    const topology = buildNfseIssuanceRabbitMqTopology({ queuePrefix: prefix })

    for (const name of collectRouteNames(topology)) {
      expect(name.startsWith(`${prefix}.nfse-issuance.v1.`)).toBe(true)
    }
  })

  /**
   * O trilho fiscal da prefeitura não pode dividir fila com nenhum outro: uma mensagem de NFS-e
   * consumida pelo consumidor de CT-e seria descartada em silêncio.
   */
  it('never shares an exchange or a queue with the other rails', () => {
    const prefix = `transportada.contract.${crypto.randomUUID()}`
    const nfseNames = new Set(
      collectRouteNames(buildNfseIssuanceRabbitMqTopology({ queuePrefix: prefix })),
    )
    const otherRails = [
      buildRabbitMqTopology(prefix),
      buildNfeImportRabbitMqTopology({ queuePrefix: prefix }),
      buildNfeDistributionRabbitMqTopology({ queuePrefix: prefix }),
      buildCteIssuanceRabbitMqTopology({ queuePrefix: prefix }),
      buildMdfeIssuanceRabbitMqTopology({ queuePrefix: prefix }),
    ]

    const shared = otherRails
      .flatMap((topology) => collectRouteNames(topology))
      .filter((name) => nfseNames.has(name))

    expect(shared).toEqual([])
  })

  it('isolates rails built from different queue prefixes', () => {
    const first = buildNfseIssuanceRabbitMqTopology({ queuePrefix: 'transportada.alpha' })
    const second = buildNfseIssuanceRabbitMqTopology({ queuePrefix: 'transportada.beta' })

    const secondNames = new Set(collectRouteNames(second))

    expect(collectRouteNames(first).some((name) => secondNames.has(name))).toBe(false)
  })
})
