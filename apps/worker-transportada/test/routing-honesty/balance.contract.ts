/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { solveRoute } from '../../src/routing/domain/route-solver.js'
import { GRID_POINTS, buildEuclideanProblem } from '../routing-solver/solver-instances.fixture.js'

describe('o teto de paradas por rota (spec 104 D3)', () => {
  /**
   * ⚠️ O fitness é a **soma** dos custos, e soma é indiferente à distribuição — concentrar paradas
   * próximas num veículo até **reduz** a soma. Foi assim que uma viagem levou 207 notas e outra 8.
   */
  test('rota acima do teto produz violação explícita, com o número', () => {
    const problem = buildEuclideanProblem({
      maxStopsPerRoute: 2,
      points: GRID_POINTS,
      vehicleCount: 1,
    })

    const solution = solveRoute(problem)
    const excess = solution.violations.filter((violation) => violation.kind === 'stop_count')

    expect(excess.length).toBeGreaterThan(0)
    expect(excess[0]?.amount).toBe(problem.stops.length - 2)
  })

  /** `null` desliga, como toda restrição deste solver. */
  test('sem teto, nenhuma violação de contagem', () => {
    const solution = solveRoute(buildEuclideanProblem({ points: GRID_POINTS, vehicleCount: 1 }))

    expect(solution.violations.some((violation) => violation.kind === 'stop_count')).toBe(false)
  })

  /** Teto folgado não inventa violação nem espalha carga que cabia junta. */
  test('teto acima do que a rota usa não restringe', () => {
    const solution = solveRoute(
      buildEuclideanProblem({ maxStopsPerRoute: 50, points: GRID_POINTS, vehicleCount: 1 }),
    )

    expect(solution.violations.some((violation) => violation.kind === 'stop_count')).toBe(false)
  })
})
