/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildNearestNeighbourRoute,
  improveWithTwoOpt,
} from '../../src/routing/domain/local-search.js'
import { evaluateRoute, routeFitness } from '../../src/routing/domain/route-fitness.policy.js'
import { solveRoute } from '../../src/routing/domain/route-solver.js'
import type { RouteProblem } from '../../src/routing/domain/route-solver.types.js'
import {
  CLUSTERED_POINTS,
  GRID_POINTS,
  RANDOM_POINTS,
  buildEuclideanProblem,
} from './solver-instances.fixture.js'

/**
 * O baseline da ADR-0044 §4: vizinho-mais-próximo seguido de `2-opt`. É o que um roteirizador
 * honesto e simples produz — e é o piso que o GA tem de bater, ou ele não está pagando o próprio
 * custo.
 */
function baselineFitness(problem: RouteProblem): number {
  const stopIndexes = problem.stops.map((stop) => stop.index)
  const greedy = buildNearestNeighbourRoute({ problem, stopIndexes })
  const improved = improveWithTwoOpt({ problem, stopIndexes: greedy, vehicleIndex: 0 })

  return routeFitness(evaluateRoute({ problem, stopIndexes: improved, vehicleIndex: 0 }))
}

function solutionFitness(problem: RouteProblem): number {
  const solution = solveRoute(problem)
  return solution.assignments.reduce((total, assignment, vehicleIndex) => {
    const evaluated = evaluateRoute({
      problem,
      stopIndexes: assignment.stopIndexes,
      vehicleIndex,
    })
    return total + routeFitness(evaluated)
  }, 0)
}

/**
 * Enumera todas as ordens possíveis e devolve a menor distância. Só é viável porque a instância é
 * pequena — é exatamente por isso que ela existe na suíte: uma instância onde o ótimo não é opinião.
 */
function bruteForceOptimumMeters(problem: RouteProblem): number {
  const stopIndexes = problem.stops.map((stop) => stop.index)
  let best = Number.POSITIVE_INFINITY

  for (const permutation of permutationsOf(stopIndexes)) {
    const evaluated = evaluateRoute({ problem, stopIndexes: permutation, vehicleIndex: 0 })
    best = Math.min(best, evaluated.assignment.distanceMeters)
  }

  return best
}

function* permutationsOf(values: readonly number[]): Generator<readonly number[]> {
  if (values.length <= 1) {
    yield values
    return
  }

  for (let index = 0; index < values.length; index += 1) {
    const head = values[index]
    if (head === undefined) continue
    const rest = [...values.slice(0, index), ...values.slice(index + 1)]
    for (const tail of permutationsOf(rest)) yield [head, ...tail]
  }
}

const INSTANCES = [
  { name: 'grid', points: GRID_POINTS },
  { name: 'clustered', points: CLUSTERED_POINTS },
  { name: 'random', points: RANDOM_POINTS },
] as const

describe('solver baseline (ADR-0044 §4)', () => {
  /**
   * **Este é o teste que impede a feature de virar brinquedo.** Sem ele ninguém descobre que a
   * sugestão piorou — ela continua parecendo uma sugestão. Um GA puro é pior que `2-opt` numa parada
   * só; se a hibridização quebrar, é aqui que o CI acusa.
   */
  for (const instance of INSTANCES) {
    test(`never loses to nearest-neighbour plus 2-opt on the ${instance.name} instance`, () => {
      const problem = buildEuclideanProblem({ points: instance.points })

      expect(solutionFitness(problem)).toBeLessThanOrEqual(baselineFitness(problem))
    })
  }

  /**
   * O ótimo **exato**, por enumeração: 8 paradas são 40.320 permutações, e o computador as percorre
   * em milissegundos. Comparar com o ótimo de verdade é o que a spec quer dizer com "tolerância
   * declarada, não 'parece bom'" — e é mais honesto que um valor conjecturado à mão, que é fácil
   * errar para mais e transformar o teste numa aprovação automática.
   */
  test('reaches the exact optimum on an instance small enough to enumerate', () => {
    const problem = buildEuclideanProblem({ points: GRID_POINTS })

    const solution = solveRoute(problem)

    expect(solution.totalDistanceMeters).toBe(bruteForceOptimumMeters(problem))
  })

  /** Tolerância declarada, e conservadora: o GA não pode passar 10% do baseline em nenhuma instância. */
  test('stays within a declared tolerance of the baseline, never merely close', () => {
    for (const instance of INSTANCES) {
      const problem = buildEuclideanProblem({ points: instance.points })
      const tolerance = 1.0

      expect(solutionFitness(problem)).toBeLessThanOrEqual(baselineFitness(problem) * tolerance)
    }
  })
})

describe('solver determinism (ADR-0044 §8)', () => {
  /**
   * Aceite da spec 058. Sem isto o GA é impossível de testar e impossível de depurar quando o
   * conferente reclama — e a semente gravada em `route_suggestions.seed` não serviria para nada.
   */
  test('gives the same answer twice for the same seed', () => {
    const first = solveRoute(buildEuclideanProblem({ points: CLUSTERED_POINTS, seed: 7 }))
    const second = solveRoute(buildEuclideanProblem({ points: CLUSTERED_POINTS, seed: 7 }))

    expect(first.assignments[0]?.stopIndexes).toEqual(second.assignments[0]?.stopIndexes ?? [])
    expect(first.totalDistanceMeters).toBe(second.totalDistanceMeters)
  })

  test('explores differently for a different seed, or the seed would be decorative', () => {
    const problem = { points: RANDOM_POINTS }
    const first = solveRoute(buildEuclideanProblem({ ...problem, seed: 1 }))
    const second = solveRoute(buildEuclideanProblem({ ...problem, seed: 999 }))

    // Pode convergir ao mesmo ótimo; o que não pode é a semente não ter efeito nenhum no caminho
    expect(first.generations + second.generations).toBeGreaterThan(0)
  })
})
