/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  buildSuggestionValuationReport,
  sumVehicleRoad,
  type SuggestionVehicleValuation,
} from '../../src/routing/domain/suggestion-valuation.policy.js'

/**
 * ⚠️ Sem `??`: `null` aqui é o caso que os testes existem para cobrir, e o coalescing o
 * transformaria calado no padrão — o helper afirmaria o oposto do que o nome do teste diz.
 */
function stop(overrides: {
  readonly distanceFromPreviousMeters: null | number
  readonly durationFromPreviousSeconds: null | number
}) {
  return overrides
}

function vehicle(overrides: Partial<SuggestionVehicleValuation> = {}): SuggestionVehicleValuation {
  return {
    distanceMeters: 100_000,
    documentCount: 3,
    driverId: null,
    durationSeconds: 3_600,
    stopCount: 2,
    valuation: {
      costParcels: [],
      hasGaps: false,
      marginPercentage: '50.0000',
      revenueLines: [],
      revenueSource: 'estimated',
      totalCost: '100.0000',
      totalMargin: '100.0000',
      totalRevenue: '200.0000',
    },
    vehicleId: '00000000-0000-4000-8000-0000000000a1',
    ...overrides,
  }
}

describe('sumVehicleRoad', () => {
  /**
   * A primeira parada de um veículo não tem perna anterior, e a parada excluída da otimização
   * também não. `null` ali é o normal, não falta de dado.
   */
  it('a perna ausente da primeira parada não impede a soma', () => {
    const road = sumVehicleRoad([
      stop({ distanceFromPreviousMeters: null, durationFromPreviousSeconds: null }),
      stop({ distanceFromPreviousMeters: 12_000, durationFromPreviousSeconds: 900 }),
    ])

    expect(road).toEqual({ distanceMeters: 12_000, durationSeconds: 900 })
  })

  it('soma as pernas de todas as paradas do veículo', () => {
    const road = sumVehicleRoad([
      stop({ distanceFromPreviousMeters: null, durationFromPreviousSeconds: null }),
      stop({ distanceFromPreviousMeters: 10_000, durationFromPreviousSeconds: 600 }),
      stop({ distanceFromPreviousMeters: 5_000, durationFromPreviousSeconds: 300 }),
    ])

    expect(road).toEqual({ distanceMeters: 15_000, durationSeconds: 900 })
  })

  /**
   * ⚠️ Veículo sem nenhuma perna conhecida é distância **desconhecida**, nunca zero: zero desceria
   * o combustível a nada e a margem apareceria melhor do que é — o modo de falha que a ADR-0049 §2
   * proíbe.
   */
  it('sem nenhuma perna conhecida a distância é ausência, não zero', () => {
    const road = sumVehicleRoad([
      stop({ distanceFromPreviousMeters: null, durationFromPreviousSeconds: null }),
    ])

    expect(road).toEqual({ distanceMeters: null, durationSeconds: null })
  })

  it('parada nenhuma é ausência', () => {
    expect(sumVehicleRoad([])).toEqual({ distanceMeters: null, durationSeconds: null })
  })
})

describe('buildSuggestionValuationReport', () => {
  it('soma receita, custo e margem dos veículos', () => {
    const report = buildSuggestionValuationReport({ vehicles: [vehicle(), vehicle()] })

    expect(report.totalRevenue).toBe('400.0000')
    expect(report.totalCost).toBe('200.0000')
    expect(report.totalMargin).toBe('200.0000')
    expect(report.hasGaps).toBe(false)
    expect(report.gaps).toEqual([])
  })

  /**
   * ⚠️ **Soma, não máximo.** São caminhões distintos rodando em paralelo, e a pergunta que o
   * relatório responde é quanto custa operar o conjunto — não quando o último chega. Se um dia
   * quisermos a segunda pergunta, ela é um campo novo, nunca a troca deste.
   */
  it('o tempo total é a soma das durações, nunca o máximo', () => {
    const report = buildSuggestionValuationReport({
      vehicles: [vehicle({ durationSeconds: 3_600 }), vehicle({ durationSeconds: 7_200 })],
    })

    expect(report.totalDurationSeconds).toBe(10_800)
  })

  it('a distância total é a soma, e o veículo sem distância não vira zero', () => {
    const report = buildSuggestionValuationReport({
      vehicles: [
        vehicle({ distanceMeters: 100_000 }),
        vehicle({ distanceMeters: null, durationSeconds: null }),
      ],
    })

    expect(report.totalDistanceMeters).toBe(100_000)
    expect(report.hasGaps).toBe(true)
  })

  /**
   * A lacuna de um veículo contamina o conjunto: o total deixa de ser uma previsão fechada, e é a
   * marca ao lado do número que diz isso a quem decide aceitar a distribuição.
   */
  it('a lacuna de um veículo torna o conjunto incompleto', () => {
    const withGap = vehicle({
      valuation: {
        ...vehicle().valuation,
        costParcels: [
          {
            amount: '0.0000',
            detail: null,
            gap: 'NO_FUEL_PRICE',
            kind: 'fuel',
            source: 'missing',
          },
        ],
        hasGaps: true,
      },
    })

    const report = buildSuggestionValuationReport({ vehicles: [vehicle(), withGap] })

    expect(report.hasGaps).toBe(true)
    expect(report.gaps).toEqual(['NO_FUEL_PRICE'])
  })

  /** A mesma lacuna em dois veículos é um motivo, não dois: a lista é do conjunto. */
  it('lacunas repetidas aparecem uma vez só', () => {
    const withGap = vehicle({
      valuation: {
        ...vehicle().valuation,
        costParcels: [
          { amount: '0.0000', detail: null, gap: 'NO_FUEL_PRICE', kind: 'fuel', source: 'missing' },
        ],
        hasGaps: true,
      },
    })

    const report = buildSuggestionValuationReport({ vehicles: [withGap, withGap] })

    expect(report.gaps).toEqual(['NO_FUEL_PRICE'])
  })

  it('conjunto vazio soma zero e não inventa lacuna', () => {
    const report = buildSuggestionValuationReport({ vehicles: [] })

    expect(report.totalRevenue).toBe('0.0000')
    expect(report.totalCost).toBe('0.0000')
    expect(report.totalDistanceMeters).toBe(null)
    expect(report.totalDurationSeconds).toBe(null)
    expect(report.hasGaps).toBe(false)
  })
})
