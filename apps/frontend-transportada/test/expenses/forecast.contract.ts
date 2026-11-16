/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.4: guarda e cliente da previsão e do fora do padrão (rota da T6.3) e as contas que a tela mostra.
 */
import { describe, expect, it } from 'bun:test'

import { createExpensesClient } from '@/modules/expenses/shared/expensesClient.service'
import { ExpenseResponseError } from '@/modules/expenses/shared/expensesResponse.validation'
import { toExpenseForecast } from '@/modules/expenses/shared/expensesResult.validation'
import {
  forecastMarginPercent,
  formatCompetenceLabel,
  outOfPatternPercent,
} from '@/modules/expenses/shared/expensesResultView.service'

const RANGE = (expected: string, min: string, max: string) => ({ expected, max, min })

const OK = {
  calculatedAt: '2026-11-14T12:00:00.000Z',
  data: {
    forecast: {
      forecast: {
        cost: RANGE('65600.00', '60000.00', '70000.00'),
        profit: RANGE('34900.00', '30000.00', '38000.00'),
        revenue: RANGE('100500.00', '94000.00', '107000.00'),
      },
      monthsOfData: 3,
      status: 'limited',
      warning: 'few_data',
    },
    month: '2026-11',
    nextMonth: '2026-12',
    nextMonthBusinessDays: 22,
    outOfPattern: [
      {
        average: '3340.00',
        current: '3940.00',
        difference: '600.00',
        direction: 'above',
        key: 'e1',
        kind: 'expense',
        label: 'Seguro da frota',
      },
      {
        average: '4.71',
        current: '4.38',
        difference: '-0.33',
        direction: 'below',
        key: 'v1',
        kind: 'vehicle_cost_per_km',
        label: 'GHI7J89',
      },
    ],
    recurringExpenses: '12829.90',
    thresholdPercent: 10,
  },
}

const UNAVAILABLE = {
  data: {
    ...OK.data,
    forecast: { forecast: null, monthsOfData: 1, status: 'unavailable', warning: 'few_data' },
    outOfPattern: [],
  },
}

describe('expenses forecast — guard', () => {
  it('lê a previsão limitada, o aviso e os itens fora do padrão', () => {
    const forecast = toExpenseForecast(OK)
    expect(forecast.status).toBe('limited')
    expect(forecast.warning).toBe('few_data')
    expect(forecast.monthsOfData).toBe(3)
    expect(forecast.nextMonth).toBe('2026-12')
    expect(forecast.forecast?.revenue).toEqual(RANGE('100500.00', '94000.00', '107000.00'))
    expect(forecast.outOfPattern.map((alert) => alert.direction)).toEqual(['above', 'below'])
    expect(forecast.thresholdPercent).toBe(10)
  })

  it('sem meses suficientes não há previsão, só o aviso', () => {
    const forecast = toExpenseForecast(UNAVAILABLE)
    expect(forecast.status).toBe('unavailable')
    expect(forecast.forecast).toBeNull()
    expect(forecast.warning).toBe('few_data')
  })

  it('previsão com 6 meses vem sem aviso', () => {
    const body = structuredClone(OK)
    body.data.forecast = {
      ...body.data.forecast,
      monthsOfData: 6,
      status: 'ok',
      warning: null as never,
    }
    expect(toExpenseForecast(body).warning).toBeNull()
  })

  it('recusa resposta incoerente ou fora do vocabulário', () => {
    const noValues = structuredClone(OK)
    noValues.data.forecast = { ...noValues.data.forecast, forecast: null as never }
    expect(() => toExpenseForecast(noValues)).toThrow(ExpenseResponseError)
    const badStatus = structuredClone(OK)
    badStatus.data.forecast = { ...badStatus.data.forecast, status: 'maybe' }
    expect(() => toExpenseForecast(badStatus)).toThrow(ExpenseResponseError)
    const badKind = structuredClone(OK)
    badKind.data.outOfPattern[0] = { ...badKind.data.outOfPattern[0]!, kind: 'x' }
    expect(() => toExpenseForecast(badKind)).toThrow(ExpenseResponseError)
    const badMoney = structuredClone(OK)
    badMoney.data.recurringExpenses = '12,5'
    expect(() => toExpenseForecast(badMoney)).toThrow(ExpenseResponseError)
    expect(() => toExpenseForecast({ data: null })).toThrow(ExpenseResponseError)
  })
})

describe('expenses forecast — cliente', () => {
  it('lê pela rota da previsão com o mês pedido', async () => {
    const urls: string[] = []
    const client = createExpensesClient({
      apiUrl: 'https://api.test',
      fetch: (input) => {
        urls.push((input as Request).url)
        return Promise.resolve(new Response(JSON.stringify(OK), { status: 200 }))
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    const forecast = await client.getForecast('2026-11')
    expect(urls).toEqual(['https://api.test/expense-forecast?month=2026-11'])
    expect(forecast.calculatedAt).toBe('2026-11-14T12:00:00.000Z')
  })
})

describe('expenses forecast — contas da tela', () => {
  it('diferença e margem saem da divisão exata, com sinal', () => {
    const [above, below] = toExpenseForecast(OK).outOfPattern
    expect(outOfPatternPercent(above!)).toBe('+18,0%')
    expect(outOfPatternPercent(below!)).toBe('-7,0%')
    const forecast = toExpenseForecast(OK).forecast!
    expect(forecastMarginPercent(forecast)).toBe('34,7%')
  })

  it('média zero não tem percentual', () => {
    const [alert] = toExpenseForecast(OK).outOfPattern
    expect(outOfPatternPercent({ ...alert!, average: '0.00' })).toBeNull()
  })

  it('o mês sai com nome e ano, em maiúscula', () => {
    expect(formatCompetenceLabel('2026-12', 'pt-BR')).toBe('Dezembro/2026')
    expect(formatCompetenceLabel('2027-01', 'pt-BR')).toBe('Janeiro/2027')
  })
})
