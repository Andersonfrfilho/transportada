/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RouteProblem, RouteStopInput } from '../../src/routing/domain/route-solver.types.js'

/**
 * As instâncias da suíte são geradas a partir de coordenadas fixas, com a matriz calculada por
 * distância euclidiana. **Isto é legítimo aqui e ilegítimo em produção**, e a diferença importa: a
 * literatura de VRP (Solomon, Augerat) define seus ótimos publicados sobre distância euclidiana, e
 * comparar com eles exige a mesma métrica. É o solver que está sendo medido, não o mapa.
 *
 * O que a ADR-0044 §1 proíbe é usar linha reta para roteirizar **entrega de verdade** — ali a matriz
 * vem do OSRM, e é o `RoutingMatrixPort` que a entrega.
 */
type Point = Readonly<{ x: number; y: number }>

const METERS_PER_UNIT = 1000
/** 30 km/h em segundos por metro — velocidade urbana, e constante para a matriz ser reprodutível. */
const SECONDS_PER_METER = 0.12

export function buildEuclideanProblem(input: {
  readonly capacityKilograms?: number
  readonly demands?: readonly number[]
  readonly duty?: RouteProblem['duty']
  readonly endIndex?: number | null
  readonly points: readonly Point[]
  readonly seed?: number
  readonly serviceTimeSeconds?: number
  readonly stagnationLimit?: number
  readonly timeBudgetMilliseconds?: number
  readonly vehicleCount?: number
  readonly windows?: readonly (readonly [number, number] | null)[]
}): RouteProblem {
  const distancesMeters = input.points.map((from) =>
    input.points.map((to) =>
      Math.round(Math.hypot(from.x - to.x, from.y - to.y) * METERS_PER_UNIT),
    ),
  )
  const durationsSeconds = distancesMeters.map((row) =>
    row.map((meters) => Math.round(meters * SECONDS_PER_METER)),
  )

  const stops: RouteStopInput[] = input.points.slice(1).map((_point, offset) => {
    const index = offset + 1
    const window = input.windows?.[offset] ?? null
    return {
      index,
      serviceTimeSeconds: input.serviceTimeSeconds ?? 0,
      weightKilograms: input.demands?.[offset] ?? 0,
      windowEndSeconds: window === null ? null : window[1],
      windowStartSeconds: window === null ? null : window[0],
    }
  })

  const vehicleCount = input.vehicleCount ?? 1

  return {
    depotIndex: 0,
    distancesMeters,
    durationsSeconds,
    duty: input.duty ?? null,
    endIndex: input.endIndex === undefined ? 0 : input.endIndex,
    seed: input.seed ?? 42,
    stagnationLimit: input.stagnationLimit ?? 40,
    stops,
    timeBudgetMilliseconds: input.timeBudgetMilliseconds ?? 3_000,
    vehicles: Array.from({ length: vehicleCount }, (_value, index) => ({
      capacityKilograms: input.capacityKilograms ?? Number.MAX_SAFE_INTEGER,
      costPerMeterMicros: 1,
      id: `vehicle-${index + 1}`,
    })),
  }
}

/**
 * Um quadrado 3×3 de pontos com o depósito no canto. O ótimo é conhecido por construção: a
 * serpentina que percorre linha a linha e volta. É a instância pequena que permite comparar com o
 * ótimo **exato**, não com uma referência publicada.
 */
export const GRID_POINTS: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: 2 },
  { x: 1, y: 2 },
  { x: 1, y: 1 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 2, y: 1 },
  { x: 2, y: 2 },
]

/**
 * Instância no estilo Solomon C1: clientes agrupados em torno de um depósito central. É onde um
 * roteirizador ruim se denuncia — ele cruza de um agrupamento a outro e volta.
 */
export const CLUSTERED_POINTS: readonly Point[] = [
  { x: 35, y: 35 },
  { x: 41, y: 49 },
  { x: 35, y: 17 },
  { x: 55, y: 45 },
  { x: 55, y: 20 },
  { x: 15, y: 30 },
  { x: 25, y: 30 },
  { x: 20, y: 50 },
  { x: 10, y: 43 },
  { x: 55, y: 60 },
  { x: 30, y: 60 },
  { x: 20, y: 65 },
  { x: 50, y: 35 },
  { x: 30, y: 25 },
  { x: 15, y: 10 },
]

/** Pontos espalhados sem estrutura — o caso em que a heurística gulosa costuma ir pior. */
export const RANDOM_POINTS: readonly Point[] = [
  { x: 50, y: 50 },
  { x: 96, y: 24 },
  { x: 40, y: 5 },
  { x: 49, y: 8 },
  { x: 13, y: 7 },
  { x: 29, y: 89 },
  { x: 48, y: 30 },
  { x: 84, y: 39 },
  { x: 9, y: 62 },
  { x: 21, y: 47 },
  { x: 61, y: 95 },
  { x: 76, y: 12 },
]
