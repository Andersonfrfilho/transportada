/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveEffectiveFuelPrice,
  resolveEffectiveFuelPrices,
  type EnergyTariff,
  type FuelPriceFacts,
} from '../../src/companies/domain/fuel-price.policy.js'
import { FUEL_TYPES } from '../../src/shared/fuel.constant.js'

const UPDATED_AT = new Date('2026-08-14T12:00:00.000Z')

/** Medida na ANEEL em 21/08/2026: a linha vigente da CERAÇÁ, B3 · Convencional, em R$/MWh. */
function tariff(overrides: Partial<EnergyTariff> = {}): EnergyTariff {
  return {
    adjustmentFactor: '1.0000',
    distributorCode: 'CERACA',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-09-29',
    tePerMegawattHour: '227.7000',
    tusdPerMegawattHour: '567.8000',
    ...overrides,
  }
}

function facts(overrides: Partial<FuelPriceFacts> = {}): FuelPriceFacts {
  return {
    adjustments: [],
    energy: null,
    references: [],
    state: 'SP',
    ...overrides,
  }
}

function priceOf(result: ReturnType<typeof resolveEffectiveFuelPrices>, product: string) {
  const entry = result.find((candidate) => candidate.product === product)
  expect(entry).toBeDefined()
  return entry
}

describe('effective fuel price policy contract', () => {
  test('answers for every product of the catalog, in catalog order', () => {
    const result = resolveEffectiveFuelPrices(facts())

    expect(result.map((entry) => entry.product)).toEqual(FUEL_TYPES.map((entry) => entry.product))
    expect(result.map((entry) => entry.unit)).toEqual(FUEL_TYPES.map((entry) => entry.unit))
  })

  test('reports a product with neither adjustment nor reference as uninformed', () => {
    const result = resolveEffectiveFuelPrices(facts())

    for (const entry of result) {
      expect(entry.effectivePricePerUnit).toBeNull()
      expect(entry.source).toBeNull()
      expect(entry.updatedAt).toBeNull()
      expect(entry.reference).toBeNull()
      expect(entry.tariff).toBeNull()
    }
  })

  test('follows the reference of the company state when there is no adjustment', () => {
    const result = resolveEffectiveFuelPrices(
      facts({
        references: [
          {
            product: 'diesel-s10',
            state: 'SP',
            pricePerUnit: '6.1230',
            weekEndingOn: '2026-08-08',
          },
        ],
      }),
    )

    expect(priceOf(result, 'diesel-s10')).toEqual({
      product: 'diesel-s10',
      unit: 'litre',
      effectivePricePerUnit: '6.1230',
      source: 'anp',
      updatedAt: null,
      reference: { state: 'SP', pricePerUnit: '6.1230', weekEndingOn: '2026-08-08' },
      tariff: null,
    })
  })

  test('lets the adjustment win over the reference, and keeps the reference visible', () => {
    const result = resolveEffectiveFuelPrices(
      facts({
        adjustments: [{ product: 'diesel-s10', pricePerUnit: '5.4800', updatedAt: UPDATED_AT }],
        references: [
          {
            product: 'diesel-s10',
            state: 'SP',
            pricePerUnit: '6.1230',
            weekEndingOn: '2026-08-08',
          },
        ],
      }),
    )

    expect(priceOf(result, 'diesel-s10')).toEqual({
      product: 'diesel-s10',
      unit: 'litre',
      effectivePricePerUnit: '5.4800',
      source: 'manual',
      updatedAt: UPDATED_AT,
      reference: { state: 'SP', pricePerUnit: '6.1230', weekEndingOn: '2026-08-08' },
      tariff: null,
    })
  })

  test('answers an adjustment without any reference, with the reference null', () => {
    const result = resolveEffectiveFuelPrices(
      facts({
        adjustments: [{ product: 'gnv', pricePerUnit: '4.0900', updatedAt: UPDATED_AT }],
      }),
    )

    expect(priceOf(result, 'gnv')).toEqual({
      product: 'gnv',
      unit: 'cubic-metre',
      effectivePricePerUnit: '4.0900',
      source: 'manual',
      updatedAt: UPDATED_AT,
      reference: null,
      tariff: null,
    })
  })

  // O ajuste é por combustível: quem sobrescreve o diesel não move o etanol
  test('keeps each product independent from the others', () => {
    const result = resolveEffectiveFuelPrices(
      facts({
        adjustments: [{ product: 'diesel-s10', pricePerUnit: '5.4800', updatedAt: UPDATED_AT }],
        references: [
          {
            product: 'diesel-s10',
            state: 'SP',
            pricePerUnit: '6.1230',
            weekEndingOn: '2026-08-08',
          },
          {
            product: 'etanol-hidratado',
            state: 'SP',
            pricePerUnit: '4.2100',
            weekEndingOn: '2026-08-08',
          },
        ],
      }),
    )

    expect(priceOf(result, 'etanol-hidratado')?.effectivePricePerUnit).toBe('4.2100')
    expect(priceOf(result, 'etanol-hidratado')?.source).toBe('anp')
    expect(priceOf(result, 'gasolina-comum')?.effectivePricePerUnit).toBeNull()
  })

  test('never borrows the reference of another state', () => {
    const result = resolveEffectiveFuelPrices(
      facts({
        references: [
          {
            product: 'diesel-s10',
            state: 'MG',
            pricePerUnit: '5.9900',
            weekEndingOn: '2026-08-08',
          },
        ],
        state: 'SP',
      }),
    )

    expect(priceOf(result, 'diesel-s10')?.effectivePricePerUnit).toBeNull()
    expect(priceOf(result, 'diesel-s10')?.reference).toBeNull()
    expect(priceOf(result, 'diesel-s10')?.source).toBeNull()
  })

  test('never borrows the reference of another product', () => {
    const result = resolveEffectiveFuelPrices(
      facts({
        references: [
          {
            product: 'diesel-s500',
            state: 'SP',
            pricePerUnit: '5.7700',
            weekEndingOn: '2026-08-08',
          },
        ],
      }),
    )

    expect(priceOf(result, 'diesel-s10')?.effectivePricePerUnit).toBeNull()
    expect(priceOf(result, 'diesel-s500')?.effectivePricePerUnit).toBe('5.7700')
  })

  // A tabela guarda uma linha por semana: a coletada por último é a que vale
  test('takes the most recent week when the state has more than one reference', () => {
    const result = resolveEffectiveFuelPrices(
      facts({
        references: [
          {
            product: 'diesel-s10',
            state: 'SP',
            pricePerUnit: '6.1230',
            weekEndingOn: '2026-08-01',
          },
          {
            product: 'diesel-s10',
            state: 'SP',
            pricePerUnit: '6.3400',
            weekEndingOn: '2026-08-08',
          },
        ],
      }),
    )

    expect(priceOf(result, 'diesel-s10')?.effectivePricePerUnit).toBe('6.3400')
    expect(priceOf(result, 'diesel-s10')?.reference?.weekEndingOn).toBe('2026-08-08')
  })
})

/**
 * A energia não tem semana da ANP nem UF: a chave é a distribuidora, a tarifa é publicada em R$/MWh
 * e é seca — sem ICMS, sem PIS/COFINS e sem bandeira. O que a transforma no que a conta cobra é o
 * fator que a empresa declara, e é por isso que ele entra na conta e não numa segunda coluna.
 */
describe('effective energy price contract', () => {
  test('turns the two published parcels into the unit the vehicle consumes', () => {
    const result = resolveEffectiveFuelPrices(facts({ energy: tariff() }))

    expect(priceOf(result, 'eletrico')).toEqual({
      product: 'eletrico',
      unit: 'kilowatt-hour',
      effectivePricePerUnit: '0.7955',
      source: 'aneel',
      updatedAt: null,
      reference: null,
      tariff: tariff(),
    })
  })

  /**
   * Uma divisão só, arredondada uma vez: dividir por mil e depois multiplicar arredondaria o mesmo
   * número duas vezes, e o tique perdido no meio não volta para o R$/km do veículo.
   */
  test('applies the declared factor over the sum, rounding once', () => {
    const result = resolveEffectiveFuelPrices(
      facts({ energy: tariff({ adjustmentFactor: '1.2500' }) }),
    )

    expect(priceOf(result, 'eletrico')?.effectivePricePerUnit).toBe('0.9944')
  })

  test('keeps the factor of one as the price the ANEEL published', () => {
    const dry = resolveEffectiveFuelPrices(facts({ energy: tariff() }))
    const raised = resolveEffectiveFuelPrices(
      facts({ energy: tariff({ adjustmentFactor: '1.3500' }) }),
    )

    expect(dry.find((entry) => entry.product === 'eletrico')?.effectivePricePerUnit).toBe('0.7955')
    expect(raised.find((entry) => entry.product === 'eletrico')?.effectivePricePerUnit).toBe(
      '1.0739',
    )
  })

  test('lets the adjustment win over the tariff, and keeps the tariff visible', () => {
    const result = resolveEffectiveFuelPrices(
      facts({
        adjustments: [{ product: 'eletrico', pricePerUnit: '0.8900', updatedAt: UPDATED_AT }],
        energy: tariff(),
      }),
    )

    expect(priceOf(result, 'eletrico')).toEqual({
      product: 'eletrico',
      unit: 'kilowatt-hour',
      effectivePricePerUnit: '0.8900',
      source: 'manual',
      updatedAt: UPDATED_AT,
      reference: null,
      tariff: tariff(),
    })
  })

  // Sem distribuidora escolhida, ou com a escolhida ainda sem coleta, não há o que apresentar
  test('reports the electric product as uninformed while there is no tariff', () => {
    const result = resolveEffectiveFuelPrices(facts())

    expect(priceOf(result, 'eletrico')?.effectivePricePerUnit).toBeNull()
    expect(priceOf(result, 'eletrico')?.source).toBeNull()
    expect(priceOf(result, 'eletrico')?.tariff).toBeNull()
  })

  test('never lends the tariff to a product that burns litres', () => {
    const result = resolveEffectiveFuelPrices(facts({ energy: tariff() }))

    for (const entry of result) {
      if (entry.product === 'eletrico') continue
      expect(entry.tariff).toBeNull()
      expect(entry.source).not.toBe('aneel')
    }
  })

  test('answers the single product read with the same tariff the list carries', () => {
    const entry = resolveEffectiveFuelPrice({ ...facts({ energy: tariff() }), product: 'eletrico' })

    expect(entry.effectivePricePerUnit).toBe('0.7955')
    expect(entry.source).toBe('aneel')
    expect(entry.tariff).toEqual(tariff())
  })
})
