/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { trimRoutesToCapacity } from '../../src/routing/domain/capacity-trim.js'
import { solveRoute } from '../../src/routing/domain/route-solver.js'
import { buildEuclideanProblem } from './solver-instances.fixture.js'

/**
 * **O que passa do que o veículo carrega fica para a próxima viagem.**
 *
 * ⚠️ A regra estava escrita no tipo — `unassignedStopIndexes`: _"paradas que nenhum veículo
 * comportou vêm listadas, não empurradas estourando o peso"_ — e **ninguém a executava**: o
 * cromossomo cobre todas as paradas, então a sobra saía sempre vazia. Medido em 2026-09-09 numa
 * distribuição real: 37,5 t de carga para 27,9 t de frota, e quatro dos cinco caminhões nasceram
 * acima do teto (a Fiorino de 650 kg com 4.307 kg — 663%).
 */
describe('capacity trim contract', () => {
  const PROBLEM = buildEuclideanProblem({
    capacityKilograms: 100,
    demands: [60, 60, 60],
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ],
    vehicleCount: 1,
  })

  test('a carga acima do teto sai da rota e vira sobra', () => {
    const trimmed = trimRoutesToCapacity({ problem: PROBLEM, routes: [[1, 2, 3]] })

    expect(trimmed.routes[0]).toEqual([1])
    expect(trimmed.overCapacityStopIndexes).toEqual([2, 3])
  })

  /**
   * ⚠️ **Cortada a cauda, o resto vai junto** — manter a parada seguinte só porque ela é leve
   * reordenaria a entrega: a de trás passaria à frente da que ficou para amanhã.
   */
  test('a parada leve depois do corte não fura a fila', () => {
    const problem = buildEuclideanProblem({
      capacityKilograms: 100,
      demands: [60, 60, 5],
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ],
      vehicleCount: 1,
    })

    expect(trimRoutesToCapacity({ problem, routes: [[1, 2, 3]] }).routes[0]).toEqual([1])
  })

  /** ⚠️ Ficha sem teto é ausência de medida (spec 088), não veículo sem limite: a rota passa inteira. */
  test('veículo sem teto declarado não é aparado', () => {
    const problem = buildEuclideanProblem({
      capacityKilograms: 0,
      demands: [60, 60, 60],
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ],
      vehicleCount: 1,
    })

    expect(trimRoutesToCapacity({ problem, routes: [[1, 2, 3]] }).routes[0]).toEqual([1, 2, 3])
  })

  /**
   * A ponta a ponta: o solver deixa de devolver veículo estourado, e o que não coube aparece em
   * `unassignedStopIndexes` — que é o que a tela lê como sobra.
   */
  test('a solução não devolve mais veículo acima do teto', () => {
    const solution = solveRoute(PROBLEM)
    const weightByIndex = new Map(PROBLEM.stops.map((stop) => [stop.index, stop.weightKilograms]))

    for (const assignment of solution.assignments) {
      const load = assignment.stopIndexes.reduce(
        (total, index) => total + (weightByIndex.get(index) ?? 0),
        0,
      )
      expect(load).toBeLessThanOrEqual(100)
    }
    expect(solution.unassignedStopIndexes.length).toBeGreaterThan(0)
  })
})
