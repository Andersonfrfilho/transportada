/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { FUEL_TYPES } from '../../src/fuel-price-pull/domain/fuel.constant.js'

/**
 * Cópia por valor da lista da API — o cron não importa código dela. Sem esta asserção, um produto
 * acrescentado de um lado só apareceria como preço que nunca é coletado.
 */
const CATALOG = [
  { product: 'diesel-s10', unit: 'litre' },
  { product: 'diesel-s500', unit: 'litre' },
  { product: 'gasolina-comum', unit: 'litre' },
  { product: 'etanol-hidratado', unit: 'litre' },
  { product: 'gnv', unit: 'cubic-metre' },
] as const

describe('cron fuel catalog', () => {
  test('matches the API catalog, in the same order and with the same units', () => {
    expect(FUEL_TYPES).toEqual(CATALOG)
  })

  test('keeps the gas in cubic metres, so a m³ price never lands on a litre column', () => {
    expect(FUEL_TYPES.find((entry) => entry.product === 'gnv')?.unit).toBe('cubic-metre')
    expect(
      FUEL_TYPES.filter((entry) => entry.product !== 'gnv').every(
        (entry) => entry.unit === 'litre',
      ),
    ).toBeTrue()
  })
})
