/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.4, CA03/CA04: cada rota do módulo pede a permissão certa (leitura × escrita, sem uma implicar a outra),
 * o `companyId` e o autor vêm do contexto, e conta/ocorrência de outra empresa responde 404.
 */
import { describe, expect, it } from 'bun:test'

import {
  createCancelExpenseOccurrenceUseCase,
  createListExpenseOccurrencesUseCase,
  createSettleExpenseOccurrenceUseCase,
} from '../../src/expenses/application/expense-occurrence.use-case.js'
import {
  createCreateExpenseCategoryUseCase,
  createCreateExpenseUseCase,
  createListExpenseCategoriesUseCase,
  createListExpensesUseCase,
  createSetExpenseCategoryActiveUseCase,
  createSetExpenseCategoryCostGroupUseCase,
  createUpdateExpenseUseCase,
} from '../../src/expenses/application/expense.use-case.js'
import { createExpenseRoutes } from '../../src/expenses/presentation/expense.routes.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  buildInMemoryExpenses,
  CATEGORY_RENT_ID,
  COMPANY_A,
  COMPANY_B,
  USER_ID,
} from '../fixtures/expenses-in-memory.fixture.js'

const unused = {
  execute: (): never => {
    throw new Error('not used by this suite')
  },
}

function buildRoutes(ports = buildInMemoryExpenses()) {
  return {
    ports,
    routes: createExpenseRoutes({
      cancelOccurrence: createCancelExpenseOccurrenceUseCase(ports),
      createCategory: createCreateExpenseCategoryUseCase(ports),
      createExpense: createCreateExpenseUseCase(ports),
      // T1.4b: as viagens do pagamento têm a própria suíte (`occurrence-trips.contract.ts`).
      includeOccurrenceTrip: unused,
      listAvailableTrips: unused,
      listOccurrenceTrips: unused,
      removeOccurrenceTrip: unused,
      listCategories: createListExpenseCategoriesUseCase(ports),
      listExpenses: createListExpensesUseCase(ports),
      listOccurrences: createListExpenseOccurrencesUseCase(ports),
      now: () => new Date('2026-11-13T15:00:00Z'),
      setCategoryActive: createSetExpenseCategoryActiveUseCase(ports),
      setCategoryCostGroup: createSetExpenseCategoryCostGroupUseCase(ports),
      settleOccurrence: createSettleExpenseOccurrenceUseCase(ports),
      updateExpense: createUpdateExpenseUseCase(ports),
    }),
  }
}

function contextOf(companyId: string): never {
  const scope: CompanyContext = {
    companyId,
    kind: 'company',
    membershipId: '00000000-0000-4000-8000-0000000000f1',
    permissions: new Set(['expenses.read', 'expenses.manage']),
    roles: ['company-admin'],
    userId: USER_ID,
  }
  return { identity: undefined, scope } as never
}

type Routes = ReturnType<typeof buildRoutes>['routes']

function call(
  routes: Routes,
  input: {
    readonly body?: unknown
    readonly companyId?: string
    readonly id?: string
    readonly method: string
    readonly path: string
    readonly pathname: string
  },
): Promise<Response> {
  const route = routes.find((r) => r.method === input.method && r.pathname === input.pathname)
  if (route === undefined) throw new Error(`missing route ${input.method} ${input.pathname}`)
  return route.execute({
    context: contextOf(input.companyId ?? COMPANY_A),
    correlationId: 'expenses-contract',
    pathParameters: input.id === undefined ? {} : { id: input.id },
    request: new Request(`http://api.test${input.path}`, {
      ...(input.body === undefined
        ? {}
        : { body: JSON.stringify(input.body), headers: { 'content-type': 'application/json' } }),
      method: input.method,
    }),
  })
}

describe('rotas de contas (spec 325 CA03)', () => {
  it('leitura pede expenses.read e escrita pede expenses.manage, sem uma implicar a outra', () => {
    const { routes } = buildRoutes()

    const permissions = routes.map((r) => [r.method, r.pathname, r.policy?.permission])

    expect(permissions).toEqual([
      ['GET', '/expenses', 'expenses.read'],
      ['POST', '/expenses', 'expenses.manage'],
      ['PATCH', '/expenses/:id', 'expenses.manage'],
      ['GET', '/expense-occurrences', 'expenses.read'],
      ['POST', '/expense-occurrences/:id/settlement', 'expenses.manage'],
      ['POST', '/expense-occurrences/:id/cancellation', 'expenses.manage'],
      ['GET', '/expense-occurrences/:id/trips', 'expenses.read'],
      ['GET', '/expense-occurrences/:id/available-trips', 'expenses.read'],
      ['POST', '/expense-occurrences/:id/trips', 'expenses.manage'],
      ['DELETE', '/expense-occurrences/:id/trips/:tripId', 'expenses.manage'],
      ['GET', '/expense-categories', 'expenses.read'],
      ['POST', '/expense-categories', 'expenses.manage'],
      ['PATCH', '/expense-categories/:id', 'expenses.manage'],
      ['PUT', '/expense-categories/:id/cost-group', 'expenses.manage'],
    ])
  })
})

describe('fluxo pelas rotas (spec 325 P1, P3, CA04)', () => {
  const create = {
    body: {
      categoryId: CATEGORY_RENT_ID,
      dueDay: 5,
      expectedAmount: '1500.00',
      kind: 'fixed',
      name: 'Aluguel',
      recurrence: 'monthly',
    },
    method: 'POST',
    path: '/expenses',
    pathname: '/expenses',
  } as const

  it('cadastra, lista as ocorrências com totais e dá baixa; o autor é o do contexto', async () => {
    const { ports, routes } = buildRoutes()

    const created = await call(routes, create)
    const listed = await call(routes, {
      method: 'GET',
      path: '/expense-occurrences?competence=2026-11',
      pathname: '/expense-occurrences',
    })
    const body = (await listed.json()) as {
      data: { id: string }[]
      totals: { expectedAmount: string }
    }
    const settled = await call(routes, {
      body: { paidAmount: '1490.00', paidAt: '2026-11-04' },
      id: body.data[0]!.id,
      method: 'POST',
      path: '/x',
      pathname: '/expense-occurrences/:id/settlement',
    })

    expect(created.status).toBe(201)
    expect(body.data).toHaveLength(1)
    expect(body.totals.expectedAmount).toBe('1500.00')
    expect(settled.status).toBe(200)
    expect(ports.occurrenceRows[0]?.paidBy).toBe(USER_ID)
  })

  it('ocorrência e conta de outra empresa → 404 sem revelar existência', async () => {
    const { ports, routes } = buildRoutes()
    await call(routes, create)
    const occurrenceId = ports.occurrenceRows[0]!.id
    const expenseId = ports.expenseRows[0]!.id

    const settle = call(routes, {
      body: { paidAmount: '1.00', paidAt: '2026-11-04' },
      companyId: COMPANY_B,
      id: occurrenceId,
      method: 'POST',
      path: '/x',
      pathname: '/expense-occurrences/:id/settlement',
    })
    const cancel = call(routes, {
      body: { reason: 'x' },
      companyId: COMPANY_B,
      id: occurrenceId,
      method: 'POST',
      path: '/x',
      pathname: '/expense-occurrences/:id/cancellation',
    })
    const patch = call(routes, {
      body: { name: 'invadida' },
      companyId: COMPANY_B,
      id: expenseId,
      method: 'PATCH',
      path: '/x',
      pathname: '/expenses/:id',
    })

    for (const attempt of [settle, cancel, patch]) {
      const error = await attempt.catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(404)
    }
    expect(ports.occurrenceRows[0]?.status).toBe('open')
  })

  it('o payload não escolhe a empresa: campo companyId é recusado (400)', async () => {
    const { routes } = buildRoutes()

    const error = await call(routes, {
      ...create,
      body: { ...create.body, companyId: COMPANY_B },
    }).catch((e: unknown) => e)

    expect((error as ApiError).status).toBe(400)
  })

  it('filtro desconhecido ou competência inválida na lista → 400', async () => {
    const { routes } = buildRoutes()

    for (const query of ['?foo=1', '?competence=2026-13', '?status=x']) {
      const error = await call(routes, {
        method: 'GET',
        path: `/expense-occurrences${query}`,
        pathname: '/expense-occurrences',
      }).catch((e: unknown) => e)
      expect((error as ApiError).status).toBe(400)
    }
  })
})
