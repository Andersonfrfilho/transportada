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
    city: '',
    documentIds: [],
    excludedFromOptimization: false,
    label: `Parada ${overrides.stopId}`,
    latitude: '-23.5613090',
    longitude: '-46.6564870',
    serviceTimeSeconds: 300,
    state: '',
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
    departureEpochSeconds: 0,
    depot: DEPOT,
    duty: null,
    end: null,
    seed: 42,
    solverTimeBudgetSeconds: 1,
    stops: [buildStop({ stopId: 'a' }), buildStop({ stopId: 'b' }), buildStop({ stopId: 'c' })],
    vehicles: [
      {
        servableStopIndexes: null,
        capacityKilograms: 10_000,
        costPerMeterMicros: 1,
        id: 'vehicle-1',
      },
    ],
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

  /**
   * ⚠️ Spec 109: **a rota parte da partida, não da meia-noite.** O relógio contava a partir da
   * meia-noite UTC — 21h de Brasília —, e as chegadas caíam de madrugada: medido em 2026-09-09,
   * cinco viagens propostas terminando às 03:04, 05:21, 07:03, 12:33 e 21:03.
   */
  test('a primeira chegada é depois da partida, nunca antes', async () => {
    const departureEpochSeconds = 1_757_419_200 + 11 * 3_600
    const context = buildContext({ departureEpochSeconds })

    const outcome = await runRouteOptimization({ context, ports: buildPorts() })

    for (const stop of outcome.orderedStops) {
      expect(stop.estimatedArrivalAt).not.toBeNull()
      expect((stop.estimatedArrivalAt as Date).getTime() / 1_000).toBeGreaterThanOrEqual(
        departureEpochSeconds,
      )
    }
  })

  /**
   * A ETA publicada tem de contar a **espera** pela abertura da janela, que é o que o fitness já
   * conta. Enquanto ela não contava, o custo escolhia a rota somando o tempo parado no portão e a
   * tela mostrava chegada às 5h da manhã — duas respostas para a mesma pergunta.
   */
  test('a chegada nunca é antes de a janela abrir', async () => {
    const context = buildContext({
      stops: [
        buildStop({ stopId: 'stop-1', windowStartSeconds: 11 * 3_600 }),
        buildStop({ stopId: 'stop-2' }),
      ],
    })

    const outcome = await runRouteOptimization({ context, ports: buildPorts() })

    const first = outcome.orderedStops.find((stop) => stop.stopId === 'stop-1')
    expect(first?.estimatedArrivalAt).not.toBeNull()
    expect((first?.estimatedArrivalAt as Date).getTime() / 1_000).toBeGreaterThanOrEqual(
      context.departureEpochSeconds + 11 * 3_600,
    )
  })

  /**
   * Decisão do usuário (2026-09-13): o tempo da proposta soma a volta ao barracão. O solver já a
   * somava no custo (`readReturnLeg`), mas ela morria aqui — só a perna "desde a anterior" era
   * gravada. A volta sai da **mesma matriz** que o solver usou, da última entrega ao fim.
   */
  test('grava a volta ao fim, da mesma matriz, quando a política manda voltar', async () => {
    const context = buildContext({ end: DEPOT })

    const outcome = await runRouteOptimization({ context, ports: buildPorts() })

    /** Pontos: 0 depósito, 1..3 paradas, 4 o fim. A matriz sintética mede (4 − i) × 60 s. */
    const indexByStopId = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
    const last = outcome.orderedStops.at(-1)
    const lastIndex = indexByStopId.get(last?.stopId ?? '') ?? 0

    expect(outcome.returnLegs).toEqual([
      {
        distanceMeters: (4 - lastIndex) * 1_000,
        durationSeconds: (4 - lastIndex) * 60,
        vehicleId: 'vehicle-1',
      },
    ])
  })

  /** `last_stop`: o motorista fecha o dia onde está, e não existe volta a gravar. */
  test('sem política de retorno não grava volta nenhuma', async () => {
    const outcome = await runRouteOptimization({ context: buildContext(), ports: buildPorts() })

    expect(outcome.returnLegs).toEqual([])
  })

  /**
   * ⚠️ Cada veículo parte da mesma partida, não de onde o relógio do anterior parou. O relógio era
   * declarado fora do laço por veículo: a primeira parada do 2º veículo herdava o trecho de estrada
   * e o tempo de serviço do 1º, e a janela só empurrava para cima — o ETA publicado inflava a cada
   * veículo na frente, embora o fitness do solver zerasse por rota.
   */
  test('a primeira parada do 2º veículo parte da partida, não do relógio do 1º veículo', async () => {
    const context = buildContext({
      stops: [buildStop({ stopId: 'a' }), buildStop({ stopId: 'b' })],
      vehicles: [
        {
          servableStopIndexes: null,
          capacityKilograms: 10_000,
          costPerMeterMicros: 1,
          id: 'vehicle-1',
        },
        {
          servableStopIndexes: null,
          capacityKilograms: 10_000,
          costPerMeterMicros: 1,
          id: 'vehicle-2',
        },
      ],
    })
    const ports = buildPorts({
      solve: () => ({
        assignments: [
          {
            costMicros: 0,
            distanceMeters: 0,
            durationSeconds: 0,
            stopIndexes: [1],
            vehicleId: 'vehicle-1',
          },
          {
            costMicros: 0,
            distanceMeters: 0,
            durationSeconds: 0,
            stopIndexes: [2],
            vehicleId: 'vehicle-2',
          },
        ],
        generations: 0,
        optimizationQuality: 'greedy',
        totalCostMicros: 0,
        totalDistanceMeters: 0,
        totalDurationSeconds: 0,
        truncated: false,
        unassignedStopIndexes: [],
        violations: [],
      }),
    })

    const outcome = await runRouteOptimization({ context, ports })

    /** Pontos: 0 depósito, 1 parada a, 2 parada b. A matriz sintética mede (to − from) × 60 s. */
    const second = outcome.orderedStops.find((stop) => stop.stopId === 'b')
    expect(second?.estimatedArrivalAt).not.toBeNull()
    expect((second?.estimatedArrivalAt as Date).getTime() / 1_000).toBe(
      context.departureEpochSeconds + 2 * 60,
    )
  })
})
