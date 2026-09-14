/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { improveWithTwoOpt } from '../../src/routing/domain/local-search.js'
import { solveRoute } from '../../src/routing/domain/route-solver.js'
import { buildEuclideanProblem } from '../routing-solver/solver-instances.fixture.js'

/** Nuvem pseudoaleatória determinística — a mesma para todo N. */
function cloud(count: number) {
  let seed = 7
  const next = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648

  return Array.from({ length: count }, () => ({ x: next() * 60, y: next() * 60 }))
}

describe('o orçamento é teto, não piso (spec 104 D1)', () => {
  /**
   * ⚠️ Medido antes desta spec: 30 s declarados, **183 s** gastos com 345 paradas. O `deadline` só
   * era conferido entre gerações, e o custo está **dentro** de uma geração — uma única passada de
   * 2-opt com 345 paradas leva minutos.
   */
  test('termina perto do orçamento mesmo com instância grande', () => {
    const problem = buildEuclideanProblem({
      points: cloud(306),
      timeBudgetMilliseconds: 3_000,
      vehicleCount: 6,
    })

    const started = Date.now()
    solveRoute(problem)
    const elapsed = Date.now() - started

    /** Folga de 3× para a máquina de CI; o defeito media 6× o orçamento. */
    expect(elapsed).toBeLessThan(9_000)
  })

  /** Interromper no meio devolve a melhor rota conhecida — nunca uma pela metade. */
  test('o 2-opt interrompido devolve rota válida e completa', () => {
    const problem = buildEuclideanProblem({ points: cloud(41), vehicleCount: 1 })
    const stopIndexes = problem.stops.map((stop) => stop.index)

    const improved = improveWithTwoOpt({
      problem,
      shouldStop: () => true,
      stopIndexes,
      vehicleIndex: 0,
    })

    expect([...improved].sort((a, b) => a - b)).toEqual([...stopIndexes].sort((a, b) => a - b))
  })

  /** Sem predicado, o comportamento é o de sempre: nenhuma instância pequena regride. */
  test('instância pequena continua convergindo por estagnação', () => {
    const problem = buildEuclideanProblem({
      points: cloud(21),
      timeBudgetMilliseconds: 30_000,
      vehicleCount: 3,
    })

    const solution = solveRoute(problem)

    expect(solution.truncated).toBe(false)
    expect(solution.generations).toBeGreaterThan(0)
  })
})
