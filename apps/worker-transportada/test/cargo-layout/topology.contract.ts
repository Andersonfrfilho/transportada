/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { buildCargoLayoutTopology } from '../../src/messaging/cargo-layout-topology.js'
import { buildCteIssuanceRabbitMqTopology } from '../../src/messaging/cte-rabbitmq-topology.js'
import { buildRouteOptimizationTopology } from '../../src/messaging/route-optimization-topology.js'

const PREFIX = 'transportada_local'
const ROUTE = `${PREFIX}.cargo-layout.v1`

describe('topologia do pedido de planta (spec 145 D8)', () => {
  test('declara principal, retry e morta com as ligações de cada uma', () => {
    const topology = buildCargoLayoutTopology({ queuePrefix: PREFIX })

    expect(topology).toEqual({
      exchange: `${ROUTE}.main.exchange`,
      queue: `${ROUTE}.main.queue`,
      routingKey: `${ROUTE}.main`,
      retry: {
        delayMs: 30_000,
        exchange: `${ROUTE}.retry.exchange`,
        maxRetries: 2,
        queue: `${ROUTE}.retry.queue`,
        routingKey: `${ROUTE}.retry`,
      },
      deadLetter: {
        exchange: `${ROUTE}.dead.exchange`,
        queue: `${ROUTE}.dead.queue`,
        routingKey: `${ROUTE}.dead`,
      },
    })
  })

  /** O prefixo é do ambiente: staging e production não podem consumir a fila um do outro. */
  test('carrega o prefixo do ambiente, nunca um literal', () => {
    const staging = buildCargoLayoutTopology({ queuePrefix: 'transportada_staging' })

    expect(staging.queue).toContain('transportada_staging')
    expect(staging.queue).not.toContain('transportada_local')
  })

  /** Uma planta pesada não pode atrasar um CT-e nem uma roteirização: filas próprias. */
  test('não divide fila com emissão fiscal nem com roteirização', () => {
    const cargo = buildCargoLayoutTopology({ queuePrefix: PREFIX })
    const others = [
      buildCteIssuanceRabbitMqTopology({ queuePrefix: PREFIX }),
      buildRouteOptimizationTopology({ queuePrefix: PREFIX }),
    ]

    for (const other of others) {
      expect(cargo.queue).not.toBe(other.queue)
      expect(cargo.exchange).not.toBe(other.exchange)
      expect(cargo.retry?.queue).not.toBe(other.retry?.queue)
      expect(cargo.deadLetter?.queue).not.toBe(other.deadLetter?.queue)
    }
  })
})
