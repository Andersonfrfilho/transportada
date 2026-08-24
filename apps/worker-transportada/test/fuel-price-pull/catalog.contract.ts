/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ANP_PRODUCT_BY_LABEL } from '../../src/fuel-price-pull/domain/anp-translation.constant.js'
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
  { product: 'eletrico', unit: 'kilowatt-hour' },
] as const

describe('cron fuel catalog', () => {
  test('matches the API catalog, in the same order and with the same units', () => {
    expect(FUEL_TYPES).toEqual(CATALOG)
  })

  test('keeps the gas in cubic metres, so a m³ price never lands on a litre column', () => {
    expect(FUEL_TYPES.find((entry) => entry.product === 'gnv')?.unit).toBe('cubic-metre')
    expect(
      FUEL_TYPES.filter((entry) => entry.product !== 'gnv' && entry.product !== 'eletrico').every(
        (entry) => entry.unit === 'litre',
      ),
    ).toBeTrue()
  })

  /**
   * A energia não está na planilha da ANP, e é isso que este ciclo tem de deixar em paz: produto do
   * catálogo sem rótulo na planilha não é linha faltando, é preço que vem de outra fonte.
   */
  test('leaves the energy out of the ANP vocabulary, without calling it an unknown product', () => {
    expect(Object.values(ANP_PRODUCT_BY_LABEL)).not.toContain('eletrico')
    expect(FUEL_TYPES.find((entry) => entry.product === 'eletrico')).toBeDefined()
  })
})
