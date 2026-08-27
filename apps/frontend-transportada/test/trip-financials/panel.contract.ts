/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  countUnknownParcels,
  describeRevenueCoverage,
  formatMargin,
  isNegative,
  splitParcels,
} from '@/modules/trip-financials/shared/financialView.service'
import {
  toFinancialSummary,
  toTripFinancialResult,
} from '@/modules/trip-financials/shared/tripFinancialsResponse.validation'
import type { TripFinancialResult } from '@/modules/trip-financials/shared/tripFinancials.types'

function result(overrides: Partial<TripFinancialResult> = {}): TripFinancialResult {
  return {
    costTotal: '1292.4500',
    frozenAt: '2026-09-01T12:00:00.000Z',
    isComplete: true,
    marginRate: '31.727500',
    netAmount: '634.5500',
    parcels: [
      { amount: '812.4500', kind: 'driver', nature: 'cost', note: '', source: 'measured' },
      {
        amount: '0.0000',
        kind: 'fuel',
        nature: 'cost',
        note: 'NO_FUEL_BASELINE',
        source: 'missing',
      },
      { amount: '73.0000', kind: 'pis_cofins', nature: 'tax', note: '', source: 'measured' },
    ],
    recalculationReason: '',
    revenueAmount: '2000.0000',
    revenueDocumentCount: 1,
    revenueExpectedCount: 1,
    taxTotal: '73.0000',
    version: 1,
    ...overrides,
  }
}

describe('o painel da conta da viagem (spec 061 T008)', () => {
  /** Imposto desce da receita; custo sai do bolso. A tela separa as duas naturezas. */
  it('separa imposto de custo', () => {
    const { costs, taxes } = splitParcels(result())

    expect(costs.map((parcel) => parcel.kind)).toEqual(['driver', 'fuel'])
    expect(taxes.map((parcel) => parcel.kind)).toEqual(['pis_cofins'])
  })

  /** Quantas parcelas o operador precisa cadastrar para o número deixar de ser aproximação. */
  it('conta as parcelas desconhecidas', () => {
    expect(countUnknownParcels(result())).toBe(1)
    expect(
      countUnknownParcels(
        result({
          parcels: [
            { amount: '0.0000', kind: 'driver', nature: 'cost', note: '', source: 'period' },
          ],
        }),
      ),
    ).toBe(0)
  })

  /** "8 de 10 notas" é o que a tela mostra quando a receita ainda não está inteira. */
  it('descreve a receita parcial, e cala quando ela está completa', () => {
    expect(describeRevenueCoverage(result())).toBeNull()
    expect(
      describeRevenueCoverage(result({ revenueDocumentCount: 8, revenueExpectedCount: 10 })),
    ).toEqual({ expected: 10, measured: 8 })
  })

  /** Margem negativa aparece negativa — esconder seria decidir por quem precisa dela. */
  it('reconhece resultado negativo', () => {
    expect(isNegative('-600.0000')).toBe(true)
    expect(isNegative('600.0000')).toBe(false)
  })

  /** Sem receita não há margem: `null` atravessa até a tela em vez de virar zero. */
  it('formata a margem com duas casas, e respeita a ausência', () => {
    expect(formatMargin('31.727500')).toBe('31,72%')
    expect(formatMargin(null)).toBeNull()
  })
})

describe('a resposta do resultado', () => {
  /** Viagem aberta não tem congelado: `null` é resposta legítima, e a tela diz isso. */
  it('aceita resultado ausente', () => {
    expect(toTripFinancialResult({ data: null })).toBeNull()
  })

  it('recusa resultado sem as parcelas', () => {
    expect(() => toTripFinancialResult({ data: { costTotal: '0.0000' } })).toThrow()
  })

  /** Folha ausente é `null`, e o total se declara aproximado — nunca zero silencioso. */
  it('preserva a folha ausente do acumulado', () => {
    const summary = toFinancialSummary({
      data: {
        costTotal: '1000.0000',
        groups: [],
        isComplete: false,
        marginRate: null,
        netAmount: '900.0000',
        payrollAmount: null,
        revenueAmount: '2000.0000',
        taxTotal: '100.0000',
        tripCount: 1,
      },
    })

    expect(summary.payrollAmount).toBeNull()
    expect(summary.marginRate).toBeNull()
  })
})
