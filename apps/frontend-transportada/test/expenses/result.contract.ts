/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T5.1: cliente, guard e locales do resultado e do rateio (rotas da T4.5 e da T4.6). A resposta é
 * entrada não confiável e vira o número que o dono usa para decidir.
 */
import { describe, expect, it } from 'bun:test'

import {
  createExpensesClient,
  serializeResultQuery,
} from '@/modules/expenses/shared/expensesClient.service'
import { ExpenseResponseError } from '@/modules/expenses/shared/expensesResponse.validation'
import {
  EXPENSE_ALLOCATABLE_GROUPS,
  EXPENSE_ALLOCATION_CRITERIA,
  EXPENSE_UNALLOCATED_REASONS,
} from '@/modules/expenses/shared/expensesResult.types'
import {
  toExpenseAllocationSettings,
  toExpenseResult,
  toExpenseUnitCosts,
} from '@/modules/expenses/shared/expensesResult.validation'

import expensesEnLocale from '@/modules/expenses/locales/expenses.en.locale.json'
import expensesLocale from '@/modules/expenses/locales/expenses.locale.json'

const LINE = {
  cost: '100.00',
  generalShare: '10.00',
  id: 'trip-1',
  margin: '-5.50',
  revenue: '104.50',
  vehicleShare: '0.00',
}

const RESULT = {
  calculatedAt: '2026-11-13T12:00:00.000Z',
  data: {
    byCustomer: [LINE],
    byTrip: [LINE],
    byVehicle: [{ ...LINE, id: 'sem-veiculo' }],
    excesses: [{ amount: '50.00', occurrenceId: 'o1', payeeDriverId: null }],
    paymentsWithoutTrips: [],
    settings: { administrative: 'per_revenue', per_km: 'per_km', vehicle_fixed: 'equal' },
    totals: { expensesTotal: '10.00', profit: '-5.50', revenue: '104.50', tripCost: '100.00' },
    unallocatedItems: [
      {
        amount: '3.00',
        name: 'Seguro',
        occurrenceId: 'o2',
        reason: 'vehicle_without_trips',
        vehicleId: 'v1',
      },
    ],
    unallocatedTotal: '3.00',
  },
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { headers, status })

function clientWith(responses: readonly Response[]) {
  const calls: { body: string; method: string; url: string }[] = []
  let index = 0
  const client = createExpensesClient({
    apiUrl: 'https://api.test',
    fetch: async (input) => {
      const request = input as Request
      calls.push({ body: await request.clone().text(), method: request.method, url: request.url })
      const response = responses[index++]
      if (response === undefined) throw new Error('sem resposta de teste')
      return response
    },
    getAccessToken: () => Promise.resolve('token'),
  })
  return { calls, client }
}

describe('expenses result — guard', () => {
  it('lê o resultado com dinheiro em texto, margem negativa e listas opcionais', () => {
    const result = toExpenseResult(RESULT)
    expect(result.totals.profit).toBe('-5.50')
    expect(result.byTrip[0]?.margin).toBe('-5.50')
    expect(result.unallocatedItems[0]?.reason).toBe('vehicle_without_trips')
    expect(result.settings?.vehicle_fixed).toBe('equal')
    expect(result.calculatedAt).toBe('2026-11-13T12:00:00.000Z')
    expect(result.filters).toEqual({})

    const minimal = toExpenseResult({
      data: {
        ...RESULT.data,
        excesses: undefined,
        settings: undefined,
        unallocatedItems: undefined,
      },
    })
    expect(minimal.excesses).toEqual([])
    expect(minimal.settings).toBeNull()
    expect(minimal.calculatedAt).toBeNull()
  })

  it('devolve os filtros aplicados que a API ecoa', () => {
    const result = toExpenseResult({
      data: { ...RESULT.data, filters: { vehicleId: 'sem-veiculo' } },
    })
    expect(result.filters).toEqual({ vehicleId: 'sem-veiculo' })
  })

  it('recusa dinheiro que não é texto decimal, linha sem total e motivo desconhecido', () => {
    const bad = (data: unknown) => () => toExpenseResult({ data })
    expect(bad({ ...RESULT.data, totals: { ...RESULT.data.totals, profit: 12.5 } })).toThrow(
      ExpenseResponseError,
    )
    expect(bad({ ...RESULT.data, totals: { ...RESULT.data.totals, profit: '1,5' } })).toThrow(
      ExpenseResponseError,
    )
    expect(bad({ ...RESULT.data, byTrip: [{ ...LINE, margin: undefined }] })).toThrow(
      ExpenseResponseError,
    )
    expect(
      bad({
        ...RESULT.data,
        unallocatedItems: [{ ...RESULT.data.unallocatedItems[0], reason: 'outro' }],
      }),
    ).toThrow(ExpenseResponseError)
    expect(() => toExpenseResult({})).toThrow(ExpenseResponseError)
    expect(() => toExpenseResult(null)).toThrow(ExpenseResponseError)
  })

  it('lê o custo por km com `null` sem quilômetro', () => {
    const line = {
      costPerKm: '2.5000',
      expensesShare: '10.00',
      kilometers: '4.000',
      totalCost: '10.00',
      tripCost: '0.00',
      vehicleId: 'v1',
    }
    const costs = toExpenseUnitCosts({
      calculatedAt: '2026-11-13T12:00:00.000Z',
      data: { general: { ...line, costPerKm: null, vehicleId: null }, perVehicle: [line] },
    })
    expect(costs.general.costPerKm).toBeNull()
    expect(costs.perVehicle[0]?.costPerKm).toBe('2.5000')
    expect(() =>
      toExpenseUnitCosts({ data: { general: line, perVehicle: [{ ...line, costPerKm: 2.5 }] } }),
    ).toThrow(ExpenseResponseError)
  })

  it('lê e recusa a configuração de rateio', () => {
    const settings = {
      administrative: 'per_revenue',
      per_km: 'per_km',
      vehicle_fixed: 'equal',
    } as const
    expect(toExpenseAllocationSettings({ data: settings })).toEqual(settings)
    expect(() =>
      toExpenseAllocationSettings({ data: { ...settings, per_km: 'por_peso' } }),
    ).toThrow(ExpenseResponseError)
    expect(() => toExpenseAllocationSettings({ data: { per_km: 'per_km' } })).toThrow(
      ExpenseResponseError,
    )
  })
})

describe('expenses result — cliente', () => {
  it('serializa o período e só os filtros preenchidos', () => {
    expect(serializeResultQuery({ from: '2026-11-01', to: '2026-11-30' })).toBe(
      'from=2026-11-01&to=2026-11-30',
    )
    expect(
      serializeResultQuery(
        {
          filters: { categoryId: '', customerId: 'sem-cliente', vehicleId: 'v1' },
          from: '2026-11-01',
          to: '2026-11-30',
        },
        { format: 'csv' },
      ),
    ).toBe('from=2026-11-01&to=2026-11-30&customerId=sem-cliente&vehicleId=v1&format=csv')
  })

  it('lê o resultado, o custo por km e as configurações nas rotas certas', async () => {
    const settings = { administrative: 'equal', per_km: 'per_km', vehicle_fixed: 'per_km' }
    const unit = {
      costPerKm: null,
      expensesShare: '0.00',
      kilometers: '0.000',
      totalCost: '0.00',
      tripCost: '0.00',
      vehicleId: null,
    }
    const { calls, client } = clientWith([
      json(RESULT),
      json({ data: { general: unit, perVehicle: [] } }),
      json({ data: settings }),
      json({ data: settings }),
    ])
    await client.getResult({ filters: { vehicleId: 'v1' }, from: '2026-11-01', to: '2026-11-30' })
    await client.getUnitCosts({
      filters: { vehicleId: 'v1' },
      from: '2026-11-01',
      to: '2026-11-30',
    })
    await client.getAllocationSettings()
    await client.updateAllocationSettings({ administrative: 'equal' })
    expect(calls[0]?.url).toBe(
      'https://api.test/expense-result?from=2026-11-01&to=2026-11-30&vehicleId=v1',
    )
    expect(calls[1]?.url).toBe('https://api.test/expense-unit-costs?from=2026-11-01&to=2026-11-30')
    expect(calls[2]).toMatchObject({
      method: 'GET',
      url: 'https://api.test/expense-allocation-settings',
    })
    expect(calls[3]).toEqual({
      body: JSON.stringify({ settings: { administrative: 'equal' } }),
      method: 'PUT',
      url: 'https://api.test/expense-allocation-settings',
    })
  })

  it('exporta pelo mesmo período e filtros e devolve o arquivo com o nome da API', async () => {
    const { calls, client } = clientWith([
      new Response('a;b', {
        headers: { 'content-disposition': 'attachment; filename="resultado-2026-11.csv"' },
        status: 200,
      }),
    ])
    const file = await client.exportResult({
      filters: { categoryId: 'c1' },
      format: 'csv',
      from: '2026-11-01',
      to: '2026-11-30',
    })
    expect(calls[0]?.url).toBe(
      'https://api.test/expense-result/export?from=2026-11-01&to=2026-11-30&categoryId=c1&format=csv',
    )
    expect(file.fileName).toBe('resultado-2026-11.csv')
    expect(await file.blob.text()).toBe('a;b')
  })

  it('exportação recusada sobe o código da API', async () => {
    const { client } = clientWith([json({ error: { code: 'FORBIDDEN' } }, 403)])
    const error = await client
      .exportResult({ format: 'pdf', from: '2026-11-01', to: '2026-11-30' })
      .catch((caught: unknown) => caught)
    expect((error as Error).message).toBe('FORBIDDEN')
  })
})

describe('expenses result — locales', () => {
  const keys = (value: unknown, prefix = ''): string[] =>
    typeof value === 'object' && value !== null
      ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
      : [prefix]

  it('pt e en têm as mesmas chaves e cobrem todo o vocabulário', () => {
    expect(keys(expensesEnLocale).sort()).toEqual(keys(expensesLocale).sort())
    for (const group of EXPENSE_ALLOCATABLE_GROUPS) {
      expect(expensesLocale.allocation.group[group]).toBeString()
      expect(expensesEnLocale.allocation.group[group]).toBeString()
    }
    for (const criterion of EXPENSE_ALLOCATION_CRITERIA) {
      expect(expensesLocale.allocation.criterion[criterion]).toBeString()
      expect(expensesEnLocale.allocation.criterion[criterion]).toBeString()
    }
    for (const reason of EXPENSE_UNALLOCATED_REASONS) {
      expect(expensesLocale.result.unallocated.reason[reason]).toBeString()
      expect(expensesEnLocale.result.unallocated.reason[reason]).toBeString()
    }
  })
})
