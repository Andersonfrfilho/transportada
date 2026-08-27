/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  runRouteOptimization,
  type RouteOptimizationContext,
  type RouteOptimizationPorts,
  type RouteOptimizationStop,
} from '../../src/routing/application/route-optimization.effect.js'
import { solveRoute } from '../../src/routing/domain/route-solver.js'

const DEPOT = { addressKey: 'depot', latitude: '-23.5505200', longitude: '-46.6333090' }

function buildStop(
  overrides: Partial<RouteOptimizationStop> & Readonly<{ stopId: string }>,
): RouteOptimizationStop {
  return {
    addressKey: `key-${overrides.stopId}`,
    documentIds: [],
    excludedFromOptimization: false,
    label: `Parada ${overrides.stopId}`,
    latitude: '-23.5613090',
    longitude: '-46.6564870',
    serviceTimeSeconds: 300,
    weightEstimated: false,
    weightKilograms: 100,
    windowEndSeconds: null,
    windowStartSeconds: null,
    ...overrides,
  }
}

function buildContext(overrides: Partial<RouteOptimizationContext> = {}): RouteOptimizationContext {
  return {
    companyId: 'company-1',
    dayStartEpochSeconds: 0,
    depot: DEPOT,
    duty: null,
    end: null,
    seed: 42,
    solverTimeBudgetSeconds: 1,
    stops: [buildStop({ stopId: 'a' }), buildStop({ stopId: 'b' }), buildStop({ stopId: 'c' })],
    vehicles: [{ capacityKilograms: 10_000, costPerMeterMicros: 1, id: 'vehicle-1' }],
    ...overrides,
  }
}

/** Matriz sintética: distância cresce com a diferença de índice, e é assimétrica de propósito. */
function buildPorts(overrides: Partial<RouteOptimizationPorts> = {}): RouteOptimizationPorts & {
  readonly requestedPointCounts: number[]
} {
  const requestedPointCounts: number[] = []

  return {
    matrix: {
      async table(coordinates) {
        requestedPointCounts.push(coordinates.length)
        const size = coordinates.length
        const build = (scale: number): readonly (readonly number[])[] =>
          Array.from({ length: size }, (_row, from) =>
            Array.from({ length: size }, (_cell, to) =>
              from === to ? 0 : (Math.abs(from - to) + (from > to ? 1 : 0)) * scale,
            ),
          )

        return { distancesMeters: build(1_000), durationsSeconds: build(60) }
      },
    },
    requestedPointCounts,
    solve: solveRoute,
    ...overrides,
  }
}

describe('route optimization effect (ADR-0044 §7)', () => {
  test('solves the trip and returns every stop in the proposed order', async () => {
    const ports = buildPorts()

    const outcome = await runRouteOptimization({ context: buildContext(), ports })

    expect(outcome.orderedStops).toHaveLength(3)
    expect(outcome.orderedStops.map((stop) => stop.sequence)).toEqual([1, 2, 3])
    expect(outcome.estimatedDistanceMeters).toBeGreaterThan(0)
  })

  /** O custo sai em dinheiro, na escala fiscal — nunca em micros crus nem em quilômetro. */
  test('reports the cost as money at the fiscal scale', async () => {
    const outcome = await runRouteOptimization({ context: buildContext(), ports: buildPorts() })

    expect(outcome.estimatedCostAmount).toMatch(/^\d+\.\d{4}$/u)
  })

  /**
   * ADR-0044 §5: a parada de precisão grosseira **não entra na matriz**. Pedi-la ao OSRM gastaria uma
   * coordenada que é palpite de quilômetros, e a entrada dela contaminaria o custo que o conferente vê.
   */
  test('keeps a coarse stop out of the matrix request entirely', async () => {
    const ports = buildPorts()
    const context = buildContext({
      stops: [
        buildStop({ stopId: 'a' }),
        buildStop({ excludedFromOptimization: true, stopId: 'palpite' }),
      ],
    })

    await runRouteOptimization({ context, ports })

    // Depósito + uma parada otimizável: a excluída não foi pedida
    expect(ports.requestedPointCounts).toEqual([2])
  })

  /** Ela aparece no fim da lista, marcada, e **sem ETA** — um horário ali seria número inventado. */
  test('appends the coarse stop at the end, with no invented arrival time', async () => {
    const context = buildContext({
      stops: [
        buildStop({ stopId: 'a' }),
        buildStop({ excludedFromOptimization: true, stopId: 'palpite' }),
      ],
    })

    const outcome = await runRouteOptimization({ context, ports: buildPorts() })
    const last = outcome.orderedStops.at(-1)

    expect(last?.stopId).toBe('palpite')
    expect(last?.excludedFromOptimization).toBe(true)
    expect(last?.estimatedArrivalAt).toBeNull()
  })

  /**
   * A queda da matriz **sobe**, não vira rota. Engolir aqui e devolver linha reta é exatamente o que
   * a ADR-0044 §1 proíbe — quem transforma isso em sugestão `failed` é o handler.
   */
  test('lets a matrix outage propagate instead of inventing a straight line', async () => {
    const ports = buildPorts({
      matrix: { table: () => Promise.reject(new Error('ROUTING_MATRIX_UNAVAILABLE')) },
    })

    const error = await runRouteOptimization({ context: buildContext(), ports }).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('ROUTING_MATRIX_UNAVAILABLE')
  })

  /** Nenhuma parada otimizável: responde sem pedir matriz e sem rodar o solver. */
  test('answers a trip of only coarse stops without asking for a matrix', async () => {
    const ports = buildPorts()
    const context = buildContext({
      stops: [buildStop({ excludedFromOptimization: true, stopId: 'palpite' })],
    })

    const outcome = await runRouteOptimization({ context, ports })

    expect(ports.requestedPointCounts).toEqual([])
    expect(outcome.orderedStops).toHaveLength(1)
    expect(outcome.estimatedDistanceMeters).toBe(0)
  })

  /** O trecho anterior vem da matriz de verdade, não de um zero de conveniência. */
  test('measures each leg from the matrix, not from a placeholder', async () => {
    const outcome = await runRouteOptimization({ context: buildContext(), ports: buildPorts() })
    const legs = outcome.orderedStops.map((stop) => stop.durationFromPreviousSeconds)

    expect(legs.every((leg) => leg !== null)).toBe(true)
    expect(legs.some((leg) => (leg ?? 0) > 0)).toBe(true)
  })

  /** ADR-0044 §8: a mesma semente dá a mesma proposta. */
  test('gives the same order twice for the same seed', async () => {
    const first = await runRouteOptimization({ context: buildContext(), ports: buildPorts() })
    const second = await runRouteOptimization({ context: buildContext(), ports: buildPorts() })

    expect(first.orderedStops.map((stop) => stop.stopId)).toEqual(
      second.orderedStops.map((stop) => stop.stopId),
    )
  })

  /** O peso estimado atravessa o solver e chega marcado à proposta. */
  test('carries the estimated-weight flag through to the proposal', async () => {
    const context = buildContext({
      stops: [buildStop({ stopId: 'a', weightEstimated: true })],
    })

    const outcome = await runRouteOptimization({ context, ports: buildPorts() })

    expect(outcome.orderedStops[0]?.weightEstimated).toBe(true)
  })
})
