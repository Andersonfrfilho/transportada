/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T5.2: períodos, comparação e percentuais da página de resultado. Percentual não é dinheiro, mas sai da mesma
 * divisão exata do domínio: nenhuma conta passa por ponto flutuante.
 */
import { describe, expect, it } from 'bun:test'

import {
  amountPerKm,
  currentMonthPeriod,
  formatMarginPercent,
  formatVariationPercent,
  listTrendCompetences,
  monthPeriod,
  previousPeriod,
  subtractAmounts,
} from '@/modules/expenses/shared/expensesResultView.service'

describe('expensesResultView.service', () => {
  it('monthPeriod cobre o mês inteiro, inclusive fevereiro de ano bissexto', () => {
    expect(monthPeriod('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(monthPeriod('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('currentMonthPeriod usa o mês do relógio dado', () => {
    expect(currentMonthPeriod(new Date(2026, 10, 14))).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    })
  })

  it('previousPeriod é o intervalo de mesmo tamanho logo antes', () => {
    expect(previousPeriod({ from: '2026-11-01', to: '2026-11-30' })).toEqual({
      from: '2026-10-02',
      to: '2026-10-31',
    })
    expect(previousPeriod({ from: '2026-11-10', to: '2026-11-12' })).toEqual({
      from: '2026-11-07',
      to: '2026-11-09',
    })
  })

  it('listTrendCompetences devolve quatro meses, do mais antigo ao mais novo, virando o ano', () => {
    expect(listTrendCompetences('2026-11-30')).toEqual(['2026-08', '2026-09', '2026-10', '2026-11'])
    expect(listTrendCompetences('2026-02-10')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('formatMarginPercent divide exato e arredonda a um décimo', () => {
    expect(formatMarginPercent('34570.10', '98400.00')).toBe('35,1%')
    expect(formatMarginPercent('-500.00', '1000.00')).toBe('-50,0%')
    expect(formatMarginPercent('10.00', '0.00')).toBeNull()
  })

  it('formatVariationPercent traz sinal e recusa base zerada', () => {
    expect(formatVariationPercent('98400.00', '91250.00')).toBe('+7,8%')
    expect(formatVariationPercent('80.00', '100.00')).toBe('-20,0%')
    expect(formatVariationPercent('10.00', '0.00')).toBeNull()
  })

  it('amountPerKm e subtractAmounts mantêm o centavo', () => {
    expect(amountPerKm('63829.90', '11800.0000')).toBe('5.41')
    expect(amountPerKm('10.00', '0.0000')).toBeNull()
    expect(subtractAmounts('10.05', '0.10')).toBe('9.95')
  })
})
