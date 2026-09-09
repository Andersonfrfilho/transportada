/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { solveRoute } from '../../src/routing/domain/route-solver.js'
import { GRID_POINTS, buildEuclideanProblem } from '../routing-solver/solver-instances.fixture.js'

/** Índices das paradas de `GRID_POINTS`: 1..8 (o 0 é o depósito). */
const ALL_STOPS = [1, 2, 3, 4, 5, 6, 7, 8]

describe('região é proibição (spec 106 D2)', () => {
  /**
   * ⚠️ Não é penalidade. As outras restrições deste solver deixam a solução inviável viver e ficar
   * cara; região não pode — uma penalidade grande ainda deixa o solver **escolher pagar**, e o que
   * sai é um roteiro que a operação recusa inteiro.
   */
  test('parada fora da cobertura nunca entra na rota do veículo', () => {
    const problem = buildEuclideanProblem({
      coverage: [
        [1, 2, 3, 4],
        [5, 6, 7, 8],
      ],
      points: GRID_POINTS,
      vehicleCount: 2,
    })

    const solution = solveRoute(problem)

    const first = solution.assignments.find((entry) => entry.vehicleId === 'vehicle-1')
    const second = solution.assignments.find((entry) => entry.vehicleId === 'vehicle-2')

    expect(first?.stopIndexes.every((index) => index <= 4)).toBe(true)
    expect(second?.stopIndexes.every((index) => index >= 5)).toBe(true)
  })

  /**
   * ⚠️ **Cumpre a ADR-0044 §5**, que promete listar a sobra e nunca foi implementada: medido em
   * 2026-09-09, 8 paradas de 600 kg num veículo de 1.000 kg saíam todas atribuídas com violação de
   * 3.800 kg e sobra vazia. Com proibição, a parada que ninguém cobre **não tem destino**.
   */
  test('parada que ninguém cobre volta como sobra, não é empurrada', () => {
    const problem = buildEuclideanProblem({
      coverage: [[1, 2, 3]],
      points: GRID_POINTS,
      vehicleCount: 1,
    })

    const solution = solveRoute(problem)
    const assigned = solution.assignments.flatMap((entry) => entry.stopIndexes)

    expect([...assigned].sort((a, b) => a - b)).toEqual([1, 2, 3])
    expect([...solution.unassignedStopIndexes].sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8])
  })

  /**
   * ADR-0055: distribuir na véspera, antes da escala, é uso normal. Veículo sem motorista pareado
   * não tem região — proibir tudo ali travaria o caso mais comum.
   */
  test('veículo sem cobertura declarada serve qualquer parada', () => {
    const problem = buildEuclideanProblem({ points: GRID_POINTS, vehicleCount: 1 })

    const solution = solveRoute(problem)

    expect(solution.assignments[0]?.stopIndexes.length).toBe(ALL_STOPS.length)
    expect(solution.unassignedStopIndexes).toEqual([])
  })

  /** Cobertura vazia é o oposto de ausente: o veículo não serve **nada**. */
  test('cobertura vazia não serve parada nenhuma', () => {
    const problem = buildEuclideanProblem({
      coverage: [[]],
      points: GRID_POINTS,
      vehicleCount: 1,
    })

    const solution = solveRoute(problem)

    expect(solution.assignments.flatMap((entry) => entry.stopIndexes)).toEqual([])
    expect([...solution.unassignedStopIndexes].sort((a, b) => a - b)).toEqual(ALL_STOPS)
  })

  /** Um veículo restrito e outro livre: o livre pega o que o restrito não pode. */
  test('a sobra do restrito cabe no veículo sem restrição', () => {
    const problem = buildEuclideanProblem({
      coverage: [[1, 2], null],
      points: GRID_POINTS,
      vehicleCount: 2,
    })

    const solution = solveRoute(problem)

    expect(solution.unassignedStopIndexes).toEqual([])
    const first = solution.assignments.find((entry) => entry.vehicleId === 'vehicle-1')
    expect(first?.stopIndexes.every((index) => index <= 2)).toBe(true)
  })
})
