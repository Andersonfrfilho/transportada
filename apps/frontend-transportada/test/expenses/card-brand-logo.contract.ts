/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { resolveCardBrandLogo } from '../../src/modules/expenses/shared/cardBrandLogo.service'

describe('expenses — logo da marca do cartão (spec 331)', () => {
  test('acha a marca pelo nome do tipo, sem diferenciar caixa nem acento', () => {
    expect(resolveCardBrandLogo('Santander Unique · Visa final 8738')).toBe(
      '/card-brands/santander.svg',
    )
    expect(resolveCardBrandLogo('Mercado Pago · Visa final 1594')).toBe(
      '/card-brands/mercado-pago.svg',
    )
    expect(resolveCardBrandLogo('CAIXA')).toBe('/card-brands/caixa.svg')
  })

  test('tipo sem marca conhecida, vazio ou ausente fica sem logo', () => {
    expect(resolveCardBrandLogo('Nubank')).toBeUndefined()
    expect(resolveCardBrandLogo('')).toBeUndefined()
    expect(resolveCardBrandLogo(null)).toBeUndefined()
    expect(resolveCardBrandLogo(undefined)).toBeUndefined()
  })
})
