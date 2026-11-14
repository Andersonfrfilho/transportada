/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.1 (RF21, RF22, CA12; ADR-0116 §7): a previsão do próximo mês. Menos de 3 meses de dado: sem previsão;
 * de 3 a 5: com o aviso "poucos dados" e a faixa mais larga; 6 ou mais: sem aviso. A faixa sempre contém o valor previsto.
 */
import { describe, expect, it } from 'bun:test'

import { parseMoneyToCents } from '../../src/expenses/domain/expense-money.policy.js'
import {
  forecastNextMonth,
  type ClosedMonthResult,
  type ForecastRange,
} from '../../src/expenses/domain/expense-forecast.policy.js'

const cents = (value: string): bigint => parseMoneyToCents(value) ?? 0n

function month(index: number, overrides: Partial<ClosedMonthResult> = {}): ClosedMonthResult {
  return {
    businessDays: 20,
    month: `2026-${String(index).padStart(2, '0')}`,
    revenue: `${10_000 + index * 500}.00`,
    tripCost: `${6000 + index * 100}.00`,
    ...overrides,
  }
}

function history(count: number): readonly ClosedMonthResult[] {
  return Array.from({ length: count }, (_, i) => month(i + 1))
}

const forecast = (count: number) =>
  forecastNextMonth({
    history: history(count),
    nextMonthBusinessDays: 21,
    recurringExpenses: '2000.00',
  })

function width(range: ForecastRange): bigint {
  return cents(range.max) - cents(range.min)
}

describe('CA12: histórico curto', () => {
  it.each([0, 1, 2])('com %i mês(es) de dado não há previsão, só o aviso', (count) => {
    const result = forecast(count)
    expect(result.status).toBe('unavailable')
    expect(result.forecast).toBeNull()
    expect(result.warning).toBe('few_data')
    expect(result.monthsOfData).toBe(count)
  })

  it.each([3, 4, 5])('com %i meses há previsão e o aviso de poucos dados', (count) => {
    const result = forecast(count)
    expect(result.status).toBe('limited')
    expect(result.warning).toBe('few_data')
    expect(result.forecast).not.toBeNull()
    expect(result.monthsOfData).toBe(count)
  })

  it('com 6 meses ou mais há previsão sem aviso', () => {
    for (const count of [6, 9]) {
      const result = forecast(count)
      expect(result.status).toBe('ok')
      expect(result.warning).toBeNull()
      expect(result.forecast).not.toBeNull()
    }
  })

  it('só os 6 meses mais recentes contam, em qualquer ordem de entrada', () => {
    const six = history(6)
    const withOld = [
      month(12, { revenue: '999999.00' }),
      ...six,
      month(0, { revenue: '1.00', month: '2025-12' }),
    ]
    const a = forecastNextMonth({
      history: six,
      nextMonthBusinessDays: 21,
      recurringExpenses: '0.00',
    })
    const b = forecastNextMonth({
      history: withOld,
      nextMonthBusinessDays: 21,
      recurringExpenses: '0.00',
    })
    // O mês `2026-12` é o mais recente e entra; o de `2025-12` fica fora. Mesma conta, sem depender da ordem do array.
    const reversed = forecastNextMonth({
      history: [...withOld].reverse(),
      nextMonthBusinessDays: 21,
      recurringExpenses: '0.00',
    })
    expect(b).toEqual(reversed)
    expect(a.monthsOfData).toBe(6)
    expect(b.monthsOfData).toBe(6)
  })
})

describe('CA12: a faixa contém o valor previsto', () => {
  it.each([3, 5, 6, 8])(
    'com %i meses, mínimo ≤ previsto ≤ máximo em faturamento, custo e lucro',
    (count) => {
      const result = forecast(count)
      if (result.forecast === null) throw new Error('a previsão deveria existir')
      for (const range of [result.forecast.revenue, result.forecast.cost, result.forecast.profit]) {
        expect(cents(range.min) <= cents(range.expected)).toBe(true)
        expect(cents(range.expected) <= cents(range.max)).toBe(true)
      }
    },
  )

  it('o lucro previsto é faturamento − custo, centavo a centavo', () => {
    const result = forecast(6)
    if (result.forecast === null) throw new Error('a previsão deveria existir')
    const { cost, profit, revenue } = result.forecast
    expect(cents(profit.expected)).toBe(cents(revenue.expected) - cents(cost.expected))
  })

  it('com poucos dados a faixa não é mais estreita que a de histórico completo (mesmos valores mensais)', () => {
    const flat = (count: number) =>
      forecastNextMonth({
        history: Array.from({ length: count }, (_, i) =>
          month(i + 1, { revenue: '10000.00', tripCost: '6000.00' }),
        ),
        nextMonthBusinessDays: 20,
        recurringExpenses: '2000.00',
      })
    const limited = flat(3)
    const full = flat(6)
    if (limited.forecast === null || full.forecast === null)
      throw new Error('a previsão deveria existir')
    expect(width(limited.forecast.revenue) >= width(full.forecast.revenue)).toBe(true)
    expect(width(limited.forecast.cost) >= width(full.forecast.cost)).toBe(true)
    // Mesma média: o valor previsto não depende da quantidade de meses quando os meses são iguais.
    expect(limited.forecast.revenue.expected).toBe(full.forecast.revenue.expected)
  })
})

describe('RF21: o cálculo é média por dia útil × dias úteis do mês previsto, mais as contas recorrentes', () => {
  it('meses iguais: faturamento = média diária × dias úteis; custo = média diária das viagens × dias úteis + recorrentes', () => {
    const result = forecastNextMonth({
      history: Array.from({ length: 6 }, (_, i) =>
        month(i + 1, { revenue: '20000.00', tripCost: '10000.00' }),
      ),
      nextMonthBusinessDays: 22,
      recurringExpenses: '3000.00',
    })
    if (result.forecast === null) throw new Error('a previsão deveria existir')
    // 20000 / 20 dias úteis = 1000,00 por dia; × 22 = 22000,00. Custo: 10000 / 20 = 500,00 × 22 = 11000,00 + 3000,00.
    expect(result.forecast.revenue.expected).toBe('22000.00')
    expect(result.forecast.cost.expected).toBe('14000.00')
    expect(result.forecast.profit.expected).toBe('8000.00')
  })

  it('mês com mais dias úteis pesa mais na média por dia, não na média por mês', () => {
    const result = forecastNextMonth({
      history: [
        month(1, { businessDays: 10, revenue: '10000.00', tripCost: '0.00' }),
        month(2, { businessDays: 30, revenue: '30000.00', tripCost: '0.00' }),
        month(3, { businessDays: 20, revenue: '20000.00', tripCost: '0.00' }),
      ],
      nextMonthBusinessDays: 10,
      recurringExpenses: '0.00',
    })
    if (result.forecast === null) throw new Error('a previsão deveria existir')
    // 60000 de faturamento em 60 dias úteis = 1000,00 por dia útil.
    expect(result.forecast.revenue.expected).toBe('10000.00')
  })
})
