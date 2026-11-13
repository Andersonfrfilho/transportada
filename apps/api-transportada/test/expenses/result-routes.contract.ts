/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.2 (CA10, RF16, RF17): as rotas do resultado pedem a permissão certa, e o `companyId` vem só do contexto.
 */
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

import { createExpenseResultRoutes } from '../../src/expenses/presentation/expense-result.routes.js'
import { DEFAULT_ALLOCATION_SETTINGS } from '../../src/expenses/domain/expense-allocation.policy.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { RESULT_COMPANY_A } from '../fixtures/expense-result-in-memory.fixture.js'

const EMPTY_RESULT = {
  byCustomer: [],
  byTrip: [],
  byVehicle: [],
  totals: { expensesTotal: '0.00', profit: '0.00', revenue: '0.00', tripCost: '0.00' },
  unallocatedTotal: '0.00',
}

function build() {
  const calls: Record<string, unknown>[] = []
  const routes = createExpenseResultRoutes({
    exportResult: {
      execute: (input) => {
        calls.push({ export: true, ...input })
        return Promise.resolve({ body: 'x', contentType: 'text/csv', fileName: 'r.csv' })
      },
    },
    getResult: {
      execute: (input) => {
        calls.push({ ...input })
        return Promise.resolve(EMPTY_RESULT)
      },
    },
    getSettings: { execute: () => Promise.resolve(DEFAULT_ALLOCATION_SETTINGS) },
    getUnitCosts: { execute: () => Promise.resolve({}) },
    updateSettings: { execute: () => Promise.resolve(DEFAULT_ALLOCATION_SETTINGS) },
  })
  return { calls, routes }
}

describe('rotas do resultado (spec 325 CA10)', () => {
  it('leitura pede expenses.read e trocar o critério pede expenses.manage', () => {
    const { routes } = build()

    expect(routes.map((r) => [r.method, r.pathname, r.policy?.permission])).toEqual([
      ['GET', '/expense-result', 'expenses.read'],
      ['GET', '/expense-result/export', 'expenses.read'],
      ['GET', '/expense-unit-costs', 'expenses.read'],
      ['GET', '/expense-allocation-settings', 'expenses.read'],
      ['PUT', '/expense-allocation-settings', 'expenses.manage'],
    ])
  })

  it('o companyId vem do contexto: o da query é ignorado', async () => {
    const { calls, routes } = build()
    const route = routes.find((r) => r.pathname === '/expense-result')
    if (route === undefined) throw new Error('missing route GET /expense-result')
    const scope: CompanyContext = {
      companyId: RESULT_COMPANY_A,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-0000000000f1',
      permissions: new Set(['expenses.read']),
      roles: ['company-admin'],
      userId: '00000000-0000-4000-8000-000000000001',
    }

    const response = await route.execute({
      context: { identity: undefined, scope } as never,
      correlationId: 'result-contract',
      pathParameters: {},
      request: new Request(
        'http://api.test/expense-result?from=2026-10-01&to=2026-10-31&companyId=00000000-0000-4000-8000-0000000000b1',
      ),
    })

    expect(response.status).toBe(200)
    expect(calls).toEqual([{ companyId: RESULT_COMPANY_A, from: '2026-10-01', to: '2026-10-31' }])
  })
})

describe('a conclusão da viagem é uma só (ADR-0116 §3)', () => {
  const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

  it('o pagamento exporta a expressão da data de conclusão', () => {
    expect(read('../../src/expenses/infrastructure/payable-trip.query.ts')).toMatch(
      /export const completedOnSql\b/,
    )
  })

  it('a consulta de viagens do rateio usa a mesma expressão, sem ler só closed_at', () => {
    const source = read('../../src/expenses/infrastructure/allocation-trip.query.ts')

    expect(source).toMatch(
      /completedOnSql[\s\S]*payable-trip\.query\.js|payable-trip\.query\.js[\s\S]*completedOnSql/,
    )
    expect(source).not.toMatch(/trips\.closedAt\s*\)?\s*(at time zone|::date)/)
  })
})

describe('filtros e exportação nas rotas (spec 325 T4.6)', () => {
  const scope: CompanyContext = {
    companyId: RESULT_COMPANY_A,
    kind: 'company',
    membershipId: '00000000-0000-4000-8000-0000000000f1',
    permissions: new Set(['expenses.read']),
    roles: ['company-admin'],
    userId: '00000000-0000-4000-8000-000000000001',
  }
  const VEHICLE = '00000000-0000-4000-8000-00000000e001'

  async function call(pathname: string, query: string) {
    const { calls, routes } = build()
    const route = routes.find((r) => r.pathname === pathname)
    if (route === undefined) throw new Error(`missing route ${pathname}`)
    const response = await route.execute({
      context: { identity: undefined, scope } as never,
      correlationId: 'corr-x',
      pathParameters: {},
      request: new Request(`http://api.test${pathname}?${query}`),
    })
    return { calls, response }
  }

  it('os filtros chegam ao caso de uso; sem filtro a chamada não muda', async () => {
    const { calls } = await call(
      '/expense-result',
      `from=2026-10-01&to=2026-10-31&vehicleId=${VEHICLE}&customerId=sem-cliente&categoryId=&payeeDriverId=`,
    )

    expect(calls).toEqual([
      {
        companyId: RESULT_COMPANY_A,
        filters: { customerId: 'sem-cliente', vehicleId: VEHICLE },
        from: '2026-10-01',
        to: '2026-10-31',
      },
    ])
  })

  it('filtro que não é id é 400', async () => {
    for (const query of [
      'vehicleId=abc',
      'categoryId=sem-veiculo',
      'payeeDriverId=x',
      'driver=1',
    ]) {
      const { response } = await call(
        '/expense-result',
        `from=2026-10-01&to=2026-10-31&${query}`,
      ).catch((error: unknown) => ({ calls: [], response: error }))
      expect(response instanceof Response ? response.status : 400).toBe(400)
    }
  })

  it('a exportação devolve o arquivo com o nome, o tipo e sem cache', async () => {
    const { calls, response } = await call(
      '/expense-result/export',
      `from=2026-10-01&to=2026-10-31&format=csv&vehicleId=${VEHICLE}`,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="r.csv"')
    expect(response.headers.get('content-type')).toBe('text/csv')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(calls).toEqual([
      {
        companyId: RESULT_COMPANY_A,
        correlationId: 'corr-x',
        export: true,
        filters: { vehicleId: VEHICLE },
        format: 'csv',
        from: '2026-10-01',
        to: '2026-10-31',
        userId: scope.userId,
      },
    ])
  })

  it('a exportação exige formato conhecido', async () => {
    for (const query of ['', '&format=xlsx']) {
      const outcome = await call(
        '/expense-result/export',
        `from=2026-10-01&to=2026-10-31${query}`,
      ).then(
        (r) => r.response.status,
        () => 400,
      )
      expect(outcome).toBe(400)
    }
  })
})
