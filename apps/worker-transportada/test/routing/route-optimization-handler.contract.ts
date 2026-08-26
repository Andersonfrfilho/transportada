/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  ROUTE_OPTIMIZATION_ERROR,
  handleRouteOptimization,
  type RouteOptimizationHandlerPorts,
} from '../../src/routing/application/route-optimization-handler.service.js'
import type { RouteOptimizationOutcome } from '../../src/routing/application/route-optimization.effect.js'

const JOB = {
  companyId: 'company-1',
  correlationId: 'correlation-1',
  suggestionId: 'suggestion-1',
} as const

const OUTCOME: RouteOptimizationOutcome = {
  estimatedCostAmount: '184.5000',
  estimatedDistanceMeters: 24_000,
  estimatedDurationSeconds: 5_400,
  orderedStops: [],
  solverMetrics: { generations: 12 },
  truncated: false,
}

function buildPorts(
  overrides: Partial<RouteOptimizationHandlerPorts> = {},
): RouteOptimizationHandlerPorts & {
  readonly completed: unknown[]
  readonly failed: { readonly errorCode: string }[]
} {
  const completed: unknown[] = []
  const failed: { readonly errorCode: string }[] = []

  return {
    async claim() {
      return { suggestionId: JOB.suggestionId }
    },
    async complete(input) {
      completed.push(input.outcome)
    },
    completed,
    async fail(input) {
      failed.push({ errorCode: input.errorCode })
    },
    failed,
    async optimize() {
      return OUTCOME
    },
    ...overrides,
  }
}

describe('route optimization handler (ADR-0044 §5 e §7)', () => {
  test('solves and completes the suggestion', async () => {
    const ports = buildPorts()

    const disposition = await handleRouteOptimization({
      attempt: 1,
      job: JOB,
      maxAttempts: 2,
      ports,
    })

    expect(disposition).toBe('ack')
    expect(ports.completed).toEqual([OUTCOME])
    expect(ports.failed).toEqual([])
  })

  /** Sugestão que sumiu ou já foi decidida: a mensagem cumpriu o papel, e repetir não a traz de volta. */
  test('acks a job whose suggestion no longer awaits solving', async () => {
    const ports = buildPorts({ claim: async () => null })

    const disposition = await handleRouteOptimization({
      attempt: 1,
      job: JOB,
      maxAttempts: 2,
      ports,
    })

    expect(disposition).toBe('ack')
    expect(ports.completed).toEqual([])
    expect(ports.failed).toEqual([])
  })

  /**
   * A matriz fora do ar volta: enquanto há tentativa sobrando ela é reentregue **sem** marcar a
   * sugestão como falha — o conferente vê "calculando", não um erro que se resolveria sozinho.
   */
  test('retries a matrix outage without marking the suggestion failed', async () => {
    const ports = buildPorts({
      optimize: () => Promise.reject(new Error('ROUTING_MATRIX_UNAVAILABLE')),
    })

    const disposition = await handleRouteOptimization({
      attempt: 1,
      job: JOB,
      maxAttempts: 2,
      ports,
    })

    expect(disposition).toBe('retry')
    expect(ports.failed).toEqual([])
  })

  /**
   * Esgotadas as tentativas, a falha é dita — **com código estável**, que é o que a tela traduz em
   * "ordene à mão". Ela nunca vira rota estimada (ADR-0044 §1).
   */
  test('gives up with a stable code once the retries are spent', async () => {
    const ports = buildPorts({
      optimize: () => Promise.reject(new Error('ROUTING_MATRIX_UNAVAILABLE')),
    })

    const disposition = await handleRouteOptimization({
      attempt: 2,
      job: JOB,
      maxAttempts: 2,
      ports,
    })

    expect(disposition).toBe('ack')
    expect(ports.failed).toEqual([{ errorCode: ROUTE_OPTIMIZATION_ERROR.matrixUnavailable }])
  })

  /**
   * Qualquer outra falha é do dado ou do código: reentregar repete o mesmo erro com o conferente
   * esperando. Ela falha na primeira, sem gastar as tentativas.
   */
  test('never retries a failure that repeating cannot fix', async () => {
    const ports = buildPorts({ optimize: () => Promise.reject(new Error('cannot read stop')) })

    const disposition = await handleRouteOptimization({
      attempt: 1,
      job: JOB,
      maxAttempts: 3,
      ports,
    })

    expect(disposition).toBe('ack')
    expect(ports.failed).toEqual([{ errorCode: ROUTE_OPTIMIZATION_ERROR.unknown }])
  })

  /** Falha nunca completa: uma sugestão não pode ficar `ready` sem roteiro. */
  test('never completes a suggestion it could not solve', async () => {
    const ports = buildPorts({ optimize: () => Promise.reject(new Error('boom')) })

    await handleRouteOptimization({ attempt: 1, job: JOB, maxAttempts: 1, ports })

    expect(ports.completed).toEqual([])
  })
})
