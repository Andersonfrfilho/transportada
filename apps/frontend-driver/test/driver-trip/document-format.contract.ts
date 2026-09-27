/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  formatDocumentAmount,
  formatDocumentWeight,
} from '@/modules/driver-trip/shared/driverDocumentFormat.service'

/**
 * O detalhe de cada nota no cartão da parada: valor em R$ e peso em kg, os dois lidos direto da
 * string decimal que a API manda — `Intl.NumberFormat` aceita a string, então nada passa por
 * número binário antes de virar texto na tela.
 */
describe('o valor e o peso de cada nota, na tela do cartão', () => {
  it('formata o valor em R$, com vírgula e separador de milhar pt-BR', () => {
    expect(formatDocumentAmount('1500.00')).toContain('R$')
    expect(formatDocumentAmount('1500.00')).toContain('1.500,00')
  })

  it('duas casas sempre — mesmo redondo', () => {
    expect(formatDocumentAmount('45.00')).toContain('45,00')
  })

  it('formata o peso com vírgula pt-BR, sem zero à direita fingindo precisão', () => {
    expect(formatDocumentWeight('12.50')).toBe('12,5')
    expect(formatDocumentWeight('12.00')).toBe('12')
    expect(formatDocumentWeight('0.750')).toBe('0,75')
  })
})
