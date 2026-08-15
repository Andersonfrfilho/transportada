/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  AMOUNT_MAX_SCALE,
  DECIMAL_AMOUNT_ERROR,
  divideScaledAmounts,
  formatAmount,
  sumScaledAmounts,
} from '@/modules/shared/decimalAmount.service'

const SERVICE_PATH = new URL('../../src/modules/shared/decimalAmount.service.ts', import.meta.url)
  .pathname

/** `Intl.NumberFormat` é permitido; converter dinheiro para binário não é. */
const FLOAT_PATTERNS: readonly RegExp[] = [
  /\bNumber\(/,
  /\bNumber\./,
  /\bparseFloat\(/,
  /\bparseInt\(/,
  /\.toFixed\(/,
]

describe('scaled amount sum', () => {
  test('sums an empty selection as zero with money scale', () => {
    expect(sumScaledAmounts([])).toBe('0.00')
  })

  test('keeps cents exact where binary float would drift', () => {
    expect(sumScaledAmounts(['0.1', '0.2'])).toBe('0.30')
    expect(sumScaledAmounts(['0.01', '0.02'])).toBe('0.03')
    expect(sumScaledAmounts(['45.00', '45.00', '45.00'])).toBe('135.00')
  })

  test('answers in the widest scale of the selection', () => {
    expect(sumScaledAmounts(['1.05', '2.0001'])).toBe('3.0501')
    expect(sumScaledAmounts(['1', '2'])).toBe('3.00')
    expect(sumScaledAmounts(['1.0000'])).toBe('1.0000')
  })

  test('accepts negative adjustments without losing the sign', () => {
    expect(sumScaledAmounts(['-10.50', '2.25'])).toBe('-8.25')
    expect(sumScaledAmounts(['-1.00', '1.00'])).toBe('0.00')
    expect(sumScaledAmounts(['-0.01'])).toBe('-0.01')
  })

  test('stays exact past the safe integer range of a float', () => {
    expect(sumScaledAmounts(['90071992547409.91', '0.10'])).toBe('90071992547410.01')
    expect(sumScaledAmounts(['9007199254740992.00', '0.01'])).toBe('9007199254740992.01')
  })

  test('rejects anything that is not a plain scaled decimal', () => {
    for (const value of ['', ' ', 'abc', '1,5', '1.2.3', '1e3', '+1.00', '.5', '1.']) {
      expect(() => sumScaledAmounts([value])).toThrow(DECIMAL_AMOUNT_ERROR.INVALID_AMOUNT)
    }
  })

  test('rejects a value with more decimal places than the fiscal scale', () => {
    expect(AMOUNT_MAX_SCALE).toBe(4)
    expect(() => sumScaledAmounts(['1.00001'])).toThrow(DECIMAL_AMOUNT_ERROR.INVALID_AMOUNT)
    expect(sumScaledAmounts(['1.0001'])).toBe('1.0001')
  })
})

describe('scaled amount division', () => {
  // Preço em quatro casas dividido por consumo em duas — a conta do R$/km, meio para cima
  test('divides two decimals in the requested scale, rounding half up', () => {
    expect(divideScaledAmounts({ dividend: '5.4800', divisor: '12.00', scale: 4 })).toBe('0.4567')
    expect(divideScaledAmounts({ dividend: '5.4802', divisor: '4.00', scale: 4 })).toBe('1.3701')
    expect(divideScaledAmounts({ dividend: '5.4801', divisor: '4.00', scale: 4 })).toBe('1.3700')
  })

  // Dividir por zero é pergunta sem resposta, não exceção: o veículo ainda não tem consumo apurado
  test('answers null instead of throwing when the divisor is zero', () => {
    expect(divideScaledAmounts({ dividend: '5.4800', divisor: '0.00', scale: 4 })).toBe(null)
  })

  test('rejects anything that is not a plain scaled decimal', () => {
    expect(() => divideScaledAmounts({ dividend: '5,48', divisor: '2.00', scale: 4 })).toThrow(
      DECIMAL_AMOUNT_ERROR.INVALID_AMOUNT,
    )
  })
})

describe('amount formatting', () => {
  test('formats as brazilian currency from the decimal string itself', () => {
    expect(formatAmount('0.00')).toContain('0,00')
    expect(formatAmount('1234.50')).toContain('1.234,50')
    expect(formatAmount('-8.25')).toContain('8,25')
    expect(formatAmount('45.00')).toContain('R$')
  })

  test('formats a value beyond float precision without drifting', () => {
    expect(formatAmount('90071992547410.01')).toContain('90.071.992.547.410,01')
  })

  test('rounds the fiscal scale to cents for display only', () => {
    expect(formatAmount('1.0001')).toContain('1,00')
    expect(sumScaledAmounts(['1.0001'])).toBe('1.0001')
  })

  test('rejects an invalid amount instead of showing NaN', () => {
    expect(() => formatAmount('abc')).toThrow(DECIMAL_AMOUNT_ERROR.INVALID_AMOUNT)
  })
})

describe('decimal amount service source', () => {
  test('never converts money through binary float', async () => {
    const source = await Bun.file(SERVICE_PATH).text()

    for (const pattern of FLOAT_PATTERNS) expect(source).not.toMatch(pattern)
    expect(source).toContain('BigInt')
  })
})
