/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { FUEL_TYPES } from '@/modules/shared/fuel.constant'

/**
 * O bundle não carrega código da API: a lista é reescrita aqui, e o que garante que as duas dizem a
 * mesma coisa é esta asserção — a mesma disciplina de `alphanumeric-tax-id.contract.ts`.
 */
const CATALOG = [
  { product: 'diesel-s10', unit: 'litre' },
  { product: 'diesel-s500', unit: 'litre' },
  { product: 'gasolina-comum', unit: 'litre' },
  { product: 'etanol-hidratado', unit: 'litre' },
  { product: 'gnv', unit: 'cubic-metre' },
] as const

describe('frontend fuel catalog', () => {
  test('matches the API catalog, in the same order and with the same units', () => {
    expect(FUEL_TYPES).toEqual(CATALOG)
  })

  // A tela rotula "R$/m³" e "km/m³" a partir da unidade — nenhum rótulo escreve "litro" literal
  test('gives the screen a unit to label with, per product', () => {
    for (const entry of FUEL_TYPES) {
      expect(['cubic-metre', 'litre']).toContain(entry.unit)
    }
    expect(FUEL_TYPES.find((entry) => entry.product === 'gnv')?.unit).toBe('cubic-metre')
  })
})
