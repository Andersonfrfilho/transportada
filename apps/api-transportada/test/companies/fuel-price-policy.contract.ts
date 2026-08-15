/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveEffectiveFuelPrices,
  type FuelPriceFacts,
} from '../../src/companies/domain/fuel-price.policy.js'
import { FUEL_TYPES } from '../../src/shared/fuel.constant.js'

const UPDATED_AT = new Date('2026-08-14T12:00:00.000Z')

function facts(overrides: Partial<FuelPriceFacts> = {}): FuelPriceFacts {
  return {
    adjustments: [],
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
