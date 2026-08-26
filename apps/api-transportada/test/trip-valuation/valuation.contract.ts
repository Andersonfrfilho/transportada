/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  buildTripValuation,
  costOverDistance,
  fuelCost,
  VALUATION_GAPS,
  type TripCostParcel,
  type TripRevenueLine,
} from '../../src/trips/domain/trip-valuation.policy.js'

function revenue(
  amount: string,
  source: TripRevenueLine['source'],
  gap: TripRevenueLine['gap'] = null,
): TripRevenueLine {
  return { amount, gap, nfeDocumentId: null, source, tripDocumentId: `doc-${amount}-${source}` }
}

function cost(amount: string, source: TripCostParcel['source']): TripCostParcel {
  return { amount, gap: source === 'missing' ? VALUATION_GAPS.notRecorded : null, kind: 'toll', source }
}

describe('a avaliação prevista da viagem', () => {
  it('soma receita, custo e margem, com a porcentagem', () => {
    const valuation = buildTripValuation({
      costParcels: [cost('180.0000', 'estimated')],
      revenueLines: [revenue('1000.0000', 'estimated'), revenue('200.0000', 'estimated')],
    })

    expect(valuation.totalRevenue).toBe('1200.0000')
    expect(valuation.totalCost).toBe('180.0000')
    expect(valuation.totalMargin).toBe('1020.0000')
    expect(valuation.marginPercentage).toBe('85.0000')
  })

  /** Custo acima da receita é caso real na montagem, e a margem negativa é a informação. */
  it('devolve margem negativa em vez de zero', () => {
    const valuation = buildTripValuation({
      costParcels: [cost('500.0000', 'estimated')],
      revenueLines: [revenue('300.0000', 'estimated')],
    })

    expect(valuation.totalMargin).toBe('-200.0000')
    expect(valuation.marginPercentage).toBe('-66.6667')
  })

  /** Dividir por zero produziria margem infinita — que parece número e não é. */
  it('não calcula porcentagem sem receita', () => {
    expect(buildTripValuation({ costParcels: [], revenueLines: [] }).marginPercentage).toBeNull()
  })

  /**
   * O ponto inteiro da D7: uma linha prevista no meio de linhas medidas torna o **conjunto**
   * previsão. Chamar isso de medido é o que produziria o relatório que discorda do financeiro.
   */
  it('a pior origem vence no total', () => {
    expect(
      buildTripValuation({
        costParcels: [],
        revenueLines: [revenue('10.0000', 'measured'), revenue('10.0000', 'estimated')],
      }).revenueSource,
    ).toBe('estimated')
    expect(
      buildTripValuation({
        costParcels: [],
        revenueLines: [
          revenue('10.0000', 'measured'),
          revenue('0.0000', 'missing', VALUATION_GAPS.noFreightRule),
        ],
      }).revenueSource,
    ).toBe('missing')
  })

  it('viagem sem nota nenhuma não é medida', () => {
    expect(buildTripValuation({ costParcels: [], revenueLines: [] }).revenueSource).toBe('missing')
  })

  it('acende a falta quando qualquer parcela ou linha tem buraco', () => {
    expect(
      buildTripValuation({ costParcels: [cost('0.0000', 'missing')], revenueLines: [] }).hasGaps,
    ).toBe(true)
    expect(
      buildTripValuation({
        costParcels: [cost('1.0000', 'estimated')],
        revenueLines: [revenue('2.0000', 'measured')],
      }).hasGaps,
    ).toBe(false)
  })
})

describe('as duas contas por quilômetro', () => {
  /**
   * Vetor à mão: 300 km a 0,45/km = 135,00. É a conta que o operador refaz na calculadora, e é o
   * único jeito de o teste não provar a si mesmo.
   */
  it('custo por quilômetro converte metros uma vez só', () => {
    expect(costOverDistance({ amountPerKilometer: '0.4500', distanceMeters: 300_000 })).toBe(
      '135.0000',
    )
  })

  /**
   * O erro clássico é inverter o consumo. 300 km a 2,5 km/l são 120 litros; a 6,00 o litro, 720,00.
   * Multiplicar em vez de dividir daria 4.500,00 — e passaria despercebido sem este vetor.
   */
  it('combustível divide pelo consumo, nunca multiplica', () => {
    expect(
      fuelCost({ distanceMeters: 300_000, kilometersPerLiter: '2.5000', pricePerLiter: '6.0000' }),
    ).toBe('720.0000')
  })

  it('consumo zero é ausência de base, não divisão por zero', () => {
    expect(
      fuelCost({ distanceMeters: 300_000, kilometersPerLiter: '0.0000', pricePerLiter: '6.0000' }),
    ).toBeNull()
  })
})
