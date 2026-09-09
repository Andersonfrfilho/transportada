/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { solveRoute } from '../../src/routing/domain/route-solver.js'
import { GRID_POINTS, buildEuclideanProblem } from '../routing-solver/solver-instances.fixture.js'

function cloud(count: number) {
  let seed = 11
  const next = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648

  return Array.from({ length: count }, () => ({ x: next() * 60, y: next() * 60 }))
}

describe('a qualidade é declarada (spec 104 D2)', () => {
  /**
   * ⚠️ Zero gerações é a **semente gulosa**, não otimização. Apresentá-la como sugestão otimizada é
   * a mentira que esta spec fecha — o operador aceita um roteiro de 150 horas achando que alguém o
   * calculou.
   */
  test('sem geração nenhuma, a qualidade é gulosa', () => {
    const problem = buildEuclideanProblem({
      points: cloud(306),
      timeBudgetMilliseconds: 1,
      vehicleCount: 6,
    })

    const solution = solveRoute(problem)

    expect(solution.generations).toBe(0)
    expect(solution.optimizationQuality).toBe('greedy')
  })

  test('convergiu por estagnação é otimizado', () => {
    const solution = solveRoute(buildEuclideanProblem({ points: GRID_POINTS }))

    expect(solution.truncated).toBe(false)
    expect(solution.optimizationQuality).toBe('optimized')
  })

  /** Evoluiu mas o relógio cortou: nem uma coisa nem outra, e a tela precisa distinguir. */
  test('cortado pelo relógio depois de evoluir é parcial', () => {
    const problem = buildEuclideanProblem({
      points: cloud(101),
      timeBudgetMilliseconds: 900,
      vehicleCount: 5,
    })

    const solution = solveRoute(problem)

    if (solution.generations === 0) {
      expect(solution.optimizationQuality).toBe('greedy')
      return
    }
    expect(solution.truncated).toBe(true)
    expect(solution.optimizationQuality).toBe('partial')
  })
})
