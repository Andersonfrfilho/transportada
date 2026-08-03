/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { invoiceAmountInWords } from '../../src/billing/domain/invoice-amount-in-words.service.js'

describe('invoice amount in words contract', () => {
  test('zero e um real: caso base e singular', () => {
    expect(invoiceAmountInWords(0n)).toBe('zero reais')
    expect(invoiceAmountInWords(100n)).toBe('um real')
    expect(invoiceAmountInWords(200n)).toBe('dois reais')
  })

  test('centavos: singular, plural e valor com centavos zerados', () => {
    expect(invoiceAmountInWords(101n)).toBe('um real e um centavo')
    expect(invoiceAmountInWords(501n)).toBe('cinco reais e um centavo')
    expect(invoiceAmountInWords(123456n)).toBe(
      'mil duzentos e trinta e quatro reais e cinquenta e seis centavos',
    )
    expect(invoiceAmountInWords(10000n)).toBe('cem reais')
    expect(invoiceAmountInWords(100000n)).toBe('mil reais')
  })

  test('milhar: com e sem centena redonda no grupo final', () => {
    expect(invoiceAmountInWords(200000n)).toBe('dois mil reais')
    expect(invoiceAmountInWords(150000n)).toBe('mil e quinhentos reais')
    expect(invoiceAmountInWords(250000n)).toBe('dois mil e quinhentos reais')
  })

  test('milhão: singular/plural e conector "de" antes de reais', () => {
    expect(invoiceAmountInWords(100000000n)).toBe('um milhão de reais')
    expect(invoiceAmountInWords(200000000n)).toBe('dois milhões de reais')
    expect(invoiceAmountInWords(123400000n)).toBe('um milhão duzentos e trinta e quatro mil reais')
    expect(invoiceAmountInWords(100050000n)).toBe('um milhão e quinhentos reais')
  })
})
