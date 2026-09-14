/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { runRouteOptimization } from '../../src/routing/application/route-optimization.effect.js'
import type { RouteProblem } from '../../src/routing/domain/route-solver.types.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'

function stop(input: { city: string; label: string; state: string }) {
  return {
    addressKey: input.label,
    city: input.city,
    documentIds: [],
    excludedFromOptimization: false,
    label: input.label,
    latitude: '-21.1',
    longitude: '-47.8',
    serviceTimeSeconds: 0,
    state: input.state,
    stopId: null,
    weightEstimated: false,
    weightKilograms: 0,
    windowEndSeconds: null,
    windowStartSeconds: null,
  }
}

/**
 * ⚠️ Este contrato é a **costura**, e ele existe porque a spec 106 chegou a ter política, tradução,
 * schema e consultas — tudo verde — com `servableStopIndexes` ainda chegando `null` ao solver. A
 * proibição existia e não restringia nada, e nenhum teste acusava: cada peça passava sozinha.
 */
describe('a cobertura chega ao solver (spec 106)', () => {
  async function solveWith(coverage: {
    readonly driverCoverage: ReadonlyMap<
      string,
      readonly { city: string; regionCode: string; scope: 'city' | 'region'; state: string }[]
    >
    readonly regionCodeByCityKey: ReadonlyMap<string, string>
  }): Promise<RouteProblem> {
    let seen: RouteProblem | null = null

    await runRouteOptimization({
      context: {
        companyId: COMPANY_ID,
        departureEpochSeconds: 0,
        depot: { addressKey: 'depot', latitude: '-21.0', longitude: '-47.0' },
        driverCoverage: coverage.driverCoverage,
        duty: null,
        end: null,
        regionCodeByCityKey: coverage.regionCodeByCityKey,
        seed: 1,
        solverTimeBudgetSeconds: 1,
        stops: [
          stop({ city: 'Ribeirão Preto', label: 'a', state: 'SP' }),
          stop({ city: 'Orlândia', label: 'b', state: 'SP' }),
        ],
        vehicles: [
          {
            capacityKilograms: 1_000,
            costPerMeterMicros: 1,
            driverId: 'driver-1',
            id: 'vehicle-1',
            servableStopIndexes: null,
          },
        ],
      },
      ports: {
        matrix: {
          table: async (points) => ({
            distancesMeters: points.map(() => points.map(() => 1_000)),
            durationsSeconds: points.map(() => points.map(() => 60)),
          }),
        },
        solve: (problem) => {
          seen = problem

          return {
            assignments: [],
            generations: 0,
            optimizationQuality: 'greedy' as const,
            totalCostMicros: 0,
            totalDistanceMeters: 0,
            totalDurationSeconds: 0,
            truncated: false,
            unassignedStopIndexes: [],
            violations: [],
          }
        },
      },
    })

    if (seen === null) throw new Error('solver não foi chamado')

    return seen
  }

  test('o motorista com zona cadastrada chega restrito ao solver', async () => {
    const problem = await solveWith({
      driverCoverage: new Map([
        ['driver-1', [{ city: '', regionCode: '1.000', scope: 'region' as const, state: '' }]],
      ]),
      regionCodeByCityKey: new Map([
        ['RIBEIRAO PRETO|SP', '1.000'],
        ['ORLANDIA|SP', '2.000'],
      ]),
    })

    expect([...(problem.vehicles[0]?.servableStopIndexes ?? [])]).toEqual([1])
  })

  /** A regra de fallback: quem não declarou não restringiu. */
  test('motorista sem cadastro chega sem restrição', async () => {
    const problem = await solveWith({
      driverCoverage: new Map(),
      regionCodeByCityKey: new Map([['RIBEIRAO PRETO|SP', '1.000']]),
    })

    expect(problem.vehicles[0]?.servableStopIndexes).toBe(null)
  })
})
