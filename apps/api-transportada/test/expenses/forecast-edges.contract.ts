/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.2: casos de borda da previsão e do fora do padrão que a T6.1 deixou abertos, em tabela. Fixa as decisões
 * registradas em `specs/325-contas-fixas-e-variaveis/evidence.md` § T6.2: a largura da faixa (15% com 6 meses, 30% com
 * 3 a 5, ou a variação observada se maior), mês sem viagem não é mês de dado, média zero alerta qualquer valor não zero.
 */
import { describe, expect, it } from 'bun:test'

import {
  detectOutOfPattern,
  forecastNextMonth,
  FORECAST_BAND_FLOOR_PERCENT,
  type ClosedMonthResult,
  type OutOfPatternItem,
} from '../../src/expenses/domain/expense-forecast.policy.js'

function month(
  index: number,
  revenue: string,
  tripCost: string,
  businessDays = 20,
): ClosedMonthResult {
  return { businessDays, month: `2026-${String(index).padStart(2, '0')}`, revenue, tripCost }
}

const busy = (index: number) => month(index, '20000.00', '10000.00')
const empty = (index: number) => month(index, '0.00', '0.00')

const run = (history: readonly ClosedMonthResult[], recurringExpenses = '0.00', days = 20) =>
  forecastNextMonth({ history, nextMonthBusinessDays: days, recurringExpenses })

describe('T6.2: mês sem viagem não é mês de dado', () => {
  it.each([
    {
      name: '6 meses na janela, 2 sem viagem → 4 de dado, com aviso',
      history: [busy(1), empty(2), busy(3), empty(4), busy(5), busy(6)],
      monthsOfData: 4,
      status: 'limited',
    },
    {
      name: '3 com viagem e 3 sem → 3 de dado, com aviso',
      history: [empty(1), empty(2), empty(3), busy(4), busy(5), busy(6)],
      monthsOfData: 3,
      status: 'limited',
    },
    {
      name: '2 com viagem e 4 sem → sem previsão',
      history: [empty(1), empty(2), empty(3), empty(4), busy(5), busy(6)],
      monthsOfData: 2,
      status: 'unavailable',
    },
    {
      name: 'mês com zero dia útil não conta, mesmo com faturamento',
      history: [busy(1), busy(2), month(3, '5000.00', '0.00', 0)],
      monthsOfData: 2,
      status: 'unavailable',
    },
    {
      name: 'mês só com custo de viagem (sem faturamento) conta',
      history: [busy(1), busy(2), month(3, '0.00', '800.00')],
      monthsOfData: 3,
      status: 'limited',
    },
    {
      name: 'mês vazio dentro da janela não abre espaço para mês mais antigo',
      history: [busy(1), busy(2), busy(3), busy(4), busy(5), empty(6), busy(7), busy(8), busy(9)],
      monthsOfData: 5,
      status: 'limited',
    },
  ])('$name', ({ history, monthsOfData, status }) => {
    const result = run(history)
    expect(result.monthsOfData).toBe(monthsOfData)
    expect(result.status).toBe(status as typeof result.status)
  })

  it('o mês sem viagem não puxa a média para baixo', () => {
    const result = run([busy(1), empty(2), busy(3), busy(4)])
    if (result.forecast === null) throw new Error('a previsão deveria existir')
    expect(result.forecast.revenue.expected).toBe('20000.00')
    expect(result.forecast.cost.expected).toBe('10000.00')
  })
})

describe('T6.2: largura da faixa', () => {
  it('a margem mínima é 15% com 6 meses e 30% com 3 a 5', () => {
    expect(FORECAST_BAND_FLOOR_PERCENT).toEqual({ limited: 30n, ok: 15n })
  })

  it.each([
    {
      name: '6 meses iguais: ±15%',
      count: 6,
      revenue: { expected: '20000.00', max: '23000.00', min: '17000.00' },
      cost: { expected: '12000.00', max: '13500.00', min: '10500.00' },
      profit: { expected: '8000.00', max: '12500.00', min: '3500.00' },
    },
    {
      name: '3 meses iguais: ±30%',
      count: 3,
      revenue: { expected: '20000.00', max: '26000.00', min: '14000.00' },
      cost: { expected: '12000.00', max: '15000.00', min: '9000.00' },
      profit: { expected: '8000.00', max: '17000.00', min: '-1000.00' },
    },
  ])(
    '$name (recorrentes de 2000,00 entram inteiras nos três pontos)',
    ({ count, revenue, cost, profit }) => {
      const result = run(
        Array.from({ length: count }, (_, i) => busy(i + 1)),
        '2000.00',
      )
      if (result.forecast === null) throw new Error('a previsão deveria existir')
      expect(result.forecast).toEqual({ cost, profit, revenue })
    },
  )

  it('variação observada maior que a margem: a faixa vai do menor ao maior mês projetado', () => {
    const result = run([
      month(1, '10000.00', '1000.00'),
      month(2, '30000.00', '1000.00'),
      month(3, '20000.00', '1000.00'),
      month(4, '20000.00', '1000.00'),
      month(5, '20000.00', '1000.00'),
      month(6, '20000.00', '1000.00'),
    ])
    if (result.forecast === null) throw new Error('a previsão deveria existir')
    expect(result.forecast.revenue).toEqual({
      expected: '20000.00',
      max: '30000.00',
      min: '10000.00',
    })
  })

  it('o mês projetado usa os dias úteis do mês previsto (mês curto não vira mês ruim)', () => {
    const result = run(
      [
        month(1, '10000.00', '0.00', 10),
        month(2, '20000.00', '0.00', 20),
        month(3, '20000.00', '0.00', 20),
        month(4, '20000.00', '0.00', 20),
        month(5, '20000.00', '0.00', 20),
        month(6, '20000.00', '0.00', 20),
      ],
      '0.00',
      20,
    )
    if (result.forecast === null) throw new Error('a previsão deveria existir')
    // 1000,00 por dia útil em todos os meses: a faixa é só a margem de 15%.
    expect(result.forecast.revenue).toEqual({
      expected: '20000.00',
      max: '23000.00',
      min: '17000.00',
    })
  })

  it('arredonda ao centavo mais próximo', () => {
    const result = run([busy(1), busy(2), month(3, '20000.01', '10000.00')], '0.00', 10)
    if (result.forecast === null) throw new Error('a previsão deveria existir')
    // 60000,01 em 60 dias úteis × 10 = 10000,001(6) → 10000,00.
    expect(result.forecast.revenue.expected).toBe('10000.00')
  })
})

describe('T6.2: entrada inválida é erro, não previsão', () => {
  it.each([
    {
      name: 'dinheiro negativo',
      history: [month(1, '-1.00', '0.00')],
      days: 20,
      recurring: '0.00',
    },
    {
      name: 'dinheiro com 3 casas',
      history: [month(1, '1.001', '0.00')],
      days: 20,
      recurring: '0.00',
    },
    {
      name: 'dia útil fracionado',
      history: [month(1, '1.00', '0.00', 1.5)],
      days: 20,
      recurring: '0.00',
    },
    { name: 'dias úteis do mês previsto negativos', history: [], days: -1, recurring: '0.00' },
    { name: 'recorrentes inválidas', history: [], days: 20, recurring: 'abc' },
  ])('$name', ({ history, days, recurring }) => {
    expect(() => run(history, recurring, days)).toThrow(RangeError)
  })
})

function item(
  current: string,
  previousMonths: readonly string[],
  key = 'k1',
  kind: OutOfPatternItem['kind'] = 'expense',
): OutOfPatternItem {
  return { current, key, kind, label: key, previousMonths }
}

const detect = (items: readonly OutOfPatternItem[], thresholdPercent = 10) =>
  detectOutOfPattern({ items, thresholdPercent })

describe('T6.2: fora do padrão nas bordas', () => {
  it.each([
    { name: 'média zero e corrente zero não alerta', current: '0.00', alerts: 0 },
    { name: 'média zero e um centavo alerta (gasto que apareceu)', current: '0.01', alerts: 1 },
  ])('$name', ({ current, alerts }) => {
    expect(detect([item(current, ['0.00', '0.00', '0.00'])])).toHaveLength(alerts)
  })

  it('média zero e valor novo trazem os números para a tela', () => {
    expect(detect([item('350.00', ['0.00', '0.00', '0.00'])])).toEqual([
      {
        average: '0.00',
        current: '350.00',
        difference: '350.00',
        direction: 'above',
        key: 'k1',
        kind: 'expense',
        label: 'k1',
      },
    ])
  })

  it('custo por km caindo a zero alerta para baixo', () => {
    const [alert] = detect([item('0.00', ['1.20', '1.30', '1.25'], 'v1', 'vehicle_cost_per_km')])
    expect(alert?.direction).toBe('below')
    expect(alert?.difference).toBe('-1.25')
  })

  it('veículo novo (menos de 3 meses próprios) não alerta, por maior que seja', () => {
    expect(detect([item('9.99', ['1.00', '1.00'], 'v1', 'vehicle_cost_per_km')])).toEqual([])
  })

  it('a regra compara com a média exibida (arredondada), sem contradizer a tela', () => {
    // Média exata 99,9966…, exibida 100,00: 110,00 é exatamente 10% da exibida e não alerta.
    expect(detect([item('110.00', ['99.99', '100.00', '100.00'])])).toEqual([])
  })

  it.each([
    { threshold: 0, current: '100.01', alerts: 1 },
    { threshold: 0, current: '100.00', alerts: 0 },
    { threshold: 12.5, current: '112.50', alerts: 0 },
    { threshold: 12.5, current: '112.51', alerts: 1 },
  ])(
    'limite $threshold%: $current sobre média 100,00 → $alerts alerta(s)',
    ({ threshold, current, alerts }) => {
      expect(detect([item(current, ['100.00', '100.00', '100.00'])], threshold)).toHaveLength(
        alerts,
      )
    },
  )

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 10.001, 1001])(
    'limite inválido (%p) é erro',
    (threshold) => {
      expect(() => detect([], threshold)).toThrow(RangeError)
    },
  )

  it('valor inválido é erro', () => {
    expect(() => detect([item('-5.00', ['1.00', '1.00', '1.00'])])).toThrow(RangeError)
  })

  it('a saída segue a ordem da entrada', () => {
    const alerts = detect([
      item('300.00', ['100.00', '100.00', '100.00'], 'b'),
      item('100.00', ['100.00', '100.00', '100.00'], 'ok'),
      item('10.00', ['100.00', '100.00', '100.00'], 'a'),
    ])
    expect(alerts.map((a) => a.key)).toEqual(['b', 'a'])
  })
})
