/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.3 (CA10, RF23): as rotas da previsão e do limite pedem a permissão certa, o `companyId` vem só do
 * contexto e o mês padrão é o corrente de São Paulo.
 */
import { describe, expect, it } from 'bun:test'

import { createExpenseForecastRoutes } from '../../src/expenses/presentation/expense-forecast.routes.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { RESULT_COMPANY_A } from '../fixtures/expense-result-in-memory.fixture.js'

const OUTPUT = {
  forecast: { forecast: null, monthsOfData: 0, status: 'unavailable', warning: 'few_data' },
  month: '2026-11',
  nextMonth: '2026-12',
  nextMonthBusinessDays: 22,
  outOfPattern: [],
  recurringExpenses: '0.00',
  thresholdPercent: 10,
} as const

function build() {
  const calls: Record<string, unknown>[] = []
  const routes = createExpenseForecastRoutes({
    getForecast: {
      execute: (input) => {
        calls.push({ ...input })
        return Promise.resolve(OUTPUT)
      },
    },
    getSettings: { execute: () => Promise.resolve(10) },
    // 14/11/2026 01:00 UTC ainda é 13/11 em São Paulo; 01/12 02:00 UTC ainda é 30/11.
    now: () => new Date('2026-12-01T02:00:00Z'),
    updateSettings: {
      execute: (input) => {
        calls.push({ update: true, ...input })
        return Promise.resolve(input.thresholdPercent)
      },
    },
  })
  return { calls, routes }
}

const scope: CompanyContext = {
  companyId: RESULT_COMPANY_A,
  kind: 'company',
  membershipId: '00000000-0000-4000-8000-0000000000f1',
  permissions: new Set(['expenses.read', 'expenses.manage']),
  roles: ['company-admin'],
  userId: '00000000-0000-4000-8000-000000000001',
}

function run(
  routes: ReturnType<typeof build>['routes'],
  method: string,
  pathname: string,
  request: Request,
): Promise<Response> {
  const route = routes.find((r) => r.method === method && r.pathname === pathname)
  if (route === undefined) throw new Error(`missing route ${method} ${pathname}`)
  return route.execute({
    context: { identity: undefined, scope } as never,
    correlationId: 'forecast-contract',
    pathParameters: {},
    request,
  })
}

describe('rotas da previsão (spec 325 T6.3, CA10)', () => {
  it('leitura pede expenses.read e trocar o limite pede expenses.manage', () => {
    const { routes } = build()

    expect(routes.map((r) => [r.method, r.pathname, r.policy?.permission])).toEqual([
      ['GET', '/expense-forecast', 'expenses.read'],
      ['GET', '/expense-out-of-pattern-settings', 'expenses.read'],
      ['PUT', '/expense-out-of-pattern-settings', 'expenses.manage'],
    ])
  })

  it('o companyId vem do contexto e o mês padrão é o corrente de São Paulo', async () => {
    const { calls, routes } = build()

    const response = await run(
      routes,
      'GET',
      '/expense-forecast',
      new Request(
        'http://api.test/expense-forecast?companyId=00000000-0000-4000-8000-0000000000b1',
      ),
    )

    expect(response.status).toBe(200)
    expect(calls).toEqual([{ companyId: RESULT_COMPANY_A, month: '2026-11' }])
    const body = (await response.json()) as { calculatedAt: string; data: typeof OUTPUT }
    expect(body.data.nextMonth).toBe('2026-12')
    expect(typeof body.calculatedAt).toBe('string')
  })

  it('mês fora de yyyy-mm e chave desconhecida são 400', async () => {
    const { routes } = build()
    for (const query of ['month=2026-13', 'month=2026-1', 'month=abc', 'foo=1']) {
      const response = await run(
        routes,
        'GET',
        '/expense-forecast',
        new Request(`http://api.test/expense-forecast?${query}`),
      ).catch((error: unknown) => error)
      expect(
        response instanceof Response ? response.status : (response as { status?: number }).status,
      ).toBe(400)
    }
  })

  it('troca o limite com até duas casas e recusa fora de 0 a 1000', async () => {
    const { calls, routes } = build()
    const put = (value: unknown): Promise<Response> =>
      run(
        routes,
        'PUT',
        '/expense-out-of-pattern-settings',
        new Request('http://api.test/expense-out-of-pattern-settings', {
          body: JSON.stringify({ thresholdPercent: value }),
          headers: { 'content-type': 'application/json' },
          method: 'PUT',
        }),
      )

    const ok = await put(12.5)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ data: { thresholdPercent: 12.5 } })
    expect(calls).toEqual([
      {
        companyId: RESULT_COMPANY_A,
        correlationId: 'forecast-contract',
        thresholdPercent: 12.5,
        update: true,
        updatedBy: scope.userId,
      },
    ])
    for (const bad of [-1, 1000.01, 12.345, 'x', null]) {
      const outcome = await put(bad).catch((error: unknown) => error)
      expect(
        outcome instanceof Response ? outcome.status : (outcome as { status?: number }).status,
      ).toBe(400)
    }
  })
})
