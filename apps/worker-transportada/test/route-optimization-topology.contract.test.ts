/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { buildCteIssuanceRabbitMqTopology } from '../src/messaging/cte-rabbitmq-topology.js'
import { buildRouteOptimizationTopology } from '../src/messaging/route-optimization-topology.js'

const PREFIX = 'transportada_local'

describe('route optimization topology (ADR-0044 §7)', () => {
  test('follows the same main/retry/dead trail the fiscal queues already use', () => {
    const topology = buildRouteOptimizationTopology({ queuePrefix: PREFIX })

    expect(topology.exchange).toBe(`${PREFIX}.route-optimization.v1.main.exchange`)
    expect(topology.queue).toBe(`${PREFIX}.route-optimization.v1.main.queue`)
    expect(topology.retry?.queue).toBe(`${PREFIX}.route-optimization.v1.retry.queue`)
    expect(topology.deadLetter?.queue).toBe(`${PREFIX}.route-optimization.v1.dead.queue`)
  })

  /** O prefixo é do ambiente: staging e production não podem consumir a fila um do outro. */
  test('carries the environment prefix, never a literal', () => {
    const staging = buildRouteOptimizationTopology({ queuePrefix: 'transportada_staging' })

    expect(staging.queue).toContain('transportada_staging')
    expect(staging.queue).not.toContain('transportada_local')
  })

  /**
   * RNF da spec 058: o worker de otimização **não compartilha fila com o de emissão fiscal**. Uma
   * sugestão pesada não pode atrasar um CT-e, e filas distintas é o que garante isso antes de
   * qualquer configuração de concorrência.
   */
  test('never shares a queue with fiscal issuance, so a heavy solve cannot delay a CT-e', () => {
    const routing = buildRouteOptimizationTopology({ queuePrefix: PREFIX })
    const fiscal = buildCteIssuanceRabbitMqTopology({ queuePrefix: PREFIX })

    expect(routing.queue).not.toBe(fiscal.queue)
    expect(routing.exchange).not.toBe(fiscal.exchange)
    expect(routing.deadLetter?.queue).not.toBe(fiscal.deadLetter?.queue)
  })

  /**
   * Uma otimização que falhou por falta de matriz falha de novo pelo mesmo motivo: a fila é o lugar
   * errado para insistir, e quem insiste é o conferente depois que o OSRM voltar.
   */
  test('retries fewer times and waits longer than a fiscal message would', () => {
    const routing = buildRouteOptimizationTopology({ queuePrefix: PREFIX })
    const fiscal = buildCteIssuanceRabbitMqTopology({ queuePrefix: PREFIX })

    expect(routing.retry?.maxRetries ?? 0).toBeLessThan(fiscal.retry?.maxRetries ?? 0)
    expect(routing.retry?.delayMs ?? 0).toBeGreaterThan(fiscal.retry?.delayMs ?? 0)
  })
})
