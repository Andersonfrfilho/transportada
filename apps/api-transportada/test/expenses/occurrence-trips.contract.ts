/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.4b (RF1d, P3c, CA05c): as viagens do pagamento de motorista/agregado. A viagem entra com a linha da pessoa
 * na parcela já calculada (copiada, nunca recalculada), o previsto vira a soma, e a parte da pessoa numa viagem entra
 * em no máximo um pagamento.
 */
import { beforeEach, describe, expect, it } from 'bun:test'

import {
  createIncludeExpenseOccurrenceTripUseCase,
  createListAvailableExpenseTripsUseCase,
  createListExpenseOccurrenceTripsUseCase,
  createRemoveExpenseOccurrenceTripUseCase,
} from '../../src/expenses/application/expense-occurrence-trip.use-case.js'
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
  createUpdateExpenseUseCase,
} from '../../src/expenses/application/expense.use-case.js'
import {
  ExpenseOccurrenceAlreadyPaidError,
  ExpenseOccurrenceNotDriverPaymentError,
  ExpenseOccurrenceNotFoundError,
  ExpenseOccurrenceTripNotFoundError,
  ExpenseTripAlreadyIncludedError,
  ExpenseTripNotCompletedError,
  ExpenseTripNotFoundError,
  ExpenseTripNotPayeeError,
  ExpenseTripParcelMissingError,
} from '../../src/expenses/domain/expense.error.js'
import {
  formatParcelAmount,
  resolveOccurrenceTripPeriod,
  validateExpenseTripPeriod,
} from '../../src/expenses/domain/expense-trip.policy.js'
import { createExpenseRoutes } from '../../src/expenses/presentation/expense.routes.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  buildInMemoryExpenseTrips,
  type InMemoryExpenseTrips,
} from '../fixtures/expense-occurrence-trips-in-memory.fixture.js'
import {
  CATEGORY_DRIVER_ID,
  CATEGORY_RENT_ID,
  COMPANY_A,
  COMPANY_B,
  DRIVER_A_ID,
  DRIVER_B_ID,
  USER_ID,
} from '../fixtures/expenses-in-memory.fixture.js'

const OTHER_DRIVER_ID = '00000000-0000-4000-8000-00000000d003'
const TRIP_1 = '00000000-0000-4000-8000-0000000071a1'
const TRIP_2 = '00000000-0000-4000-8000-0000000071a2'
const TRIP_LATE = '00000000-0000-4000-8000-0000000071a3'
const TRIP_OPEN = '00000000-0000-4000-8000-0000000071a4'
const TRIP_OTHER_DRIVER = '00000000-0000-4000-8000-0000000071a5'
const TRIP_GAP = '00000000-0000-4000-8000-0000000071a6'
const TRIP_HELPER = '00000000-0000-4000-8000-0000000071a7'
const TRIP_OTHER_COMPANY = '00000000-0000-4000-8000-0000000071b1'

const priced = (amount: string, days: number) =>
  ({ amount, dailyAmount: '200.0000', days, status: 'priced' }) as const

async function setup(): Promise<{
  ports: InMemoryExpenseTrips
  firstFortnight: string
  secondFortnight: string
}> {
  const ports = buildInMemoryExpenseTrips()
  await createCreateExpenseUseCase(ports.base).execute({
    categoryId: CATEGORY_DRIVER_ID,
    companyId: COMPANY_A,
    createdBy: USER_ID,
    expectedAmount: '3000.00',
    kind: 'fixed',
    name: 'Pagamento do João',
    payeeDriverId: DRIVER_A_ID,
    recurrence: 'fortnightly',
    today: '2026-11-13',
  })
  const november = ports.base.occurrenceRows.filter((row) => row.competence === '2026-11')
  const first = november.find((row) => row.slot === 1)
  const second = november.find((row) => row.slot === 2)
  if (first === undefined || second === undefined)
    throw new Error('fortnightly occurrences missing')

  const driverCrew = [{ driverId: DRIVER_A_ID, role: 'driver' as const }]
  ports.trips.push(
    {
      companyId: COMPANY_A,
      completedOn: '2026-11-03',
      crew: driverCrew,
      status: 'completed',
      tripId: TRIP_1,
    },
    {
      companyId: COMPANY_A,
      completedOn: '2026-11-10',
      crew: driverCrew,
      status: 'completed',
      tripId: TRIP_2,
    },
    {
      companyId: COMPANY_A,
      completedOn: '2026-11-20',
      crew: driverCrew,
      status: 'completed',
      tripId: TRIP_LATE,
    },
    {
      companyId: COMPANY_A,
      completedOn: null,
      crew: driverCrew,
      status: 'in_transit',
      tripId: TRIP_OPEN,
    },
    {
      companyId: COMPANY_A,
      completedOn: '2026-11-05',
      crew: [{ driverId: OTHER_DRIVER_ID, role: 'driver' }],
      status: 'completed',
      tripId: TRIP_OTHER_DRIVER,
    },
    {
      companyId: COMPANY_A,
      completedOn: '2026-11-06',
      crew: driverCrew,
      status: 'completed',
      tripId: TRIP_GAP,
    },
    {
      companyId: COMPANY_A,
      completedOn: '2026-11-07',
      crew: [
        { driverId: OTHER_DRIVER_ID, role: 'driver' },
        { driverId: DRIVER_A_ID, role: 'helper' },
      ],
      status: 'completed',
      tripId: TRIP_HELPER,
    },
    {
      companyId: COMPANY_B,
      completedOn: '2026-11-04',
      crew: [{ driverId: DRIVER_B_ID, role: 'driver' }],
      status: 'completed',
      tripId: TRIP_OTHER_COMPANY,
    },
  )
  ports.parcels.set(`${TRIP_1}:${DRIVER_A_ID}`, priced('600.0000', 3))
  ports.parcels.set(`${TRIP_2}:${DRIVER_A_ID}`, priced('400.0050', 2))
  ports.parcels.set(`${TRIP_LATE}:${DRIVER_A_ID}`, priced('200.0000', 1))
  ports.parcels.set(`${TRIP_GAP}:${DRIVER_A_ID}`, { gap: 'NO_PLANNED_DURATION', status: 'missing' })
  return { firstFortnight: first.id, ports, secondFortnight: second.id }
}

const include = (
  ports: InMemoryExpenseTrips,
  occurrenceId: string,
  tripId: string,
  companyId = COMPANY_A,
) =>
  createIncludeExpenseOccurrenceTripUseCase(ports).execute({
    companyId,
    includedBy: USER_ID,
    occurrenceId,
    tripId,
  })

describe('período e arredondamento das viagens do pagamento (spec 325 RF1d)', () => {
  it('quinzenal cobre a quinzena do slot; mensal, o mês inteiro', () => {
    expect(
      resolveOccurrenceTripPeriod({ competence: '2026-02', recurrence: 'fortnightly', slot: 1 }),
    ).toEqual({
      from: '2026-02-01',
      to: '2026-02-15',
    })
    expect(
      resolveOccurrenceTripPeriod({ competence: '2026-02', recurrence: 'fortnightly', slot: 2 }),
    ).toEqual({
      from: '2026-02-16',
      to: '2026-02-28',
    })
    expect(
      resolveOccurrenceTripPeriod({ competence: '2026-11', recurrence: 'monthly', slot: 1 }),
    ).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    })
    expect(
      resolveOccurrenceTripPeriod({ competence: '2026-11', recurrence: null, slot: 1 }),
    ).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    })
  })

  it('a linha da pessoa arredonda ao centavo meio para cima, por viagem', () => {
    expect(formatParcelAmount('400.0050')).toBe('400.01')
    expect(formatParcelAmount('400.0049')).toBe('400.00')
    expect(formatParcelAmount('600')).toBe('600.00')
    expect(formatParcelAmount('0.0000')).toBe('0.00')
  })

  it('período pedido à mão: datas reais, em ordem, até 93 dias', () => {
    expect(validateExpenseTripPeriod({ from: '2026-10-01', to: '2026-11-30' })).not.toBeNull()
    expect(validateExpenseTripPeriod({ from: '2026-11-30', to: '2026-11-01' })).toBeNull()
    expect(validateExpenseTripPeriod({ from: '2026-02-30', to: '2026-03-01' })).toBeNull()
    expect(validateExpenseTripPeriod({ from: '2026-01-01', to: '2026-06-30' })).toBeNull()
  })
})

describe('viagens disponíveis (spec 325 P3c)', () => {
  let context: Awaited<ReturnType<typeof setup>>
  beforeEach(async () => {
    context = await setup()
  })

  it('lista as concluídas do favorecido na quinzena, com diária × dias; a lacuna vai para pendências', async () => {
    const result = await createListAvailableExpenseTripsUseCase(context.ports).execute({
      companyId: COMPANY_A,
      occurrenceId: context.firstFortnight,
    })

    expect(result.period).toEqual({ from: '2026-11-01', to: '2026-11-15' })
    expect(result.available).toEqual([
      {
        amount: '600.00',
        completedOn: '2026-11-03',
        dailyAmount: '200.0000',
        days: 3,
        parcelKind: 'driver',
        tripId: TRIP_1,
      },
      {
        amount: '400.01',
        completedOn: '2026-11-10',
        dailyAmount: '200.0000',
        days: 2,
        parcelKind: 'driver',
        tripId: TRIP_2,
      },
    ])
    expect(result.pending).toEqual([
      {
        completedOn: '2026-11-06',
        gap: 'NO_PLANNED_DURATION',
        parcelKind: 'driver',
        tripId: TRIP_GAP,
      },
    ])
  })

  it('a viagem já incluída em qualquer pagamento sai da lista; o período pedido alcança a viagem atrasada', async () => {
    await include(context.ports, context.firstFortnight, TRIP_1)

    const result = await createListAvailableExpenseTripsUseCase(context.ports).execute({
      companyId: COMPANY_A,
      occurrenceId: context.secondFortnight,
      period: { from: '2026-11-01', to: '2026-11-30' },
    })

    expect(result.available.map((trip) => trip.tripId)).toEqual([TRIP_2, TRIP_LATE])
  })

  it('a viagem em que o favorecido foi ajudante só entra pela parcela helper (T1.4c); sem linha de ajudante, não aparece', async () => {
    const result = await createListAvailableExpenseTripsUseCase(context.ports).execute({
      companyId: COMPANY_A,
      occurrenceId: context.firstFortnight,
    })

    expect(
      [...result.available, ...result.pending].filter((trip) => trip.tripId === TRIP_HELPER),
    ).toEqual([])
  })
})

describe('incluir e remover viagem (spec 325 RF1d, CA05c)', () => {
  let context: Awaited<ReturnType<typeof setup>>
  beforeEach(async () => {
    context = await setup()
  })

  it('o previsto vira a soma das viagens incluídas; remover devolve a viagem e, sem nenhuma, o valor da conta', async () => {
    await include(context.ports, context.firstFortnight, TRIP_1)
    const both = await include(context.ports, context.firstFortnight, TRIP_2)

    expect(both.items.map((trip) => trip.tripId)).toEqual([TRIP_1, TRIP_2])
    expect(both.tripsTotal).toBe('1000.01')
    expect(both.occurrence.expectedAmount).toBe('1000.01')

    const remove = createRemoveExpenseOccurrenceTripUseCase(context.ports)
    const one = await remove.execute({
      companyId: COMPANY_A,
      occurrenceId: context.firstFortnight,
      removedBy: USER_ID,
      tripId: TRIP_1,
    })
    expect(one.occurrence.expectedAmount).toBe('400.01')

    const none = await remove.execute({
      companyId: COMPANY_A,
      occurrenceId: context.firstFortnight,
      removedBy: USER_ID,
      tripId: TRIP_2,
    })
    expect(none.items).toEqual([])
    expect(none.occurrence.expectedAmount).toBe('3000.00')

    const available = await createListAvailableExpenseTripsUseCase(context.ports).execute({
      companyId: COMPANY_A,
      occurrenceId: context.firstFortnight,
    })
    expect(available.available.map((trip) => trip.tripId)).toEqual([TRIP_1, TRIP_2])
  })

  it('a viagem entra em no máximo um pagamento (409); repetir no mesmo é idempotente', async () => {
    await include(context.ports, context.firstFortnight, TRIP_1)
    const again = await include(context.ports, context.firstFortnight, TRIP_1)

    expect(again.items).toHaveLength(1)
    await expect(include(context.ports, context.secondFortnight, TRIP_1)).rejects.toBeInstanceOf(
      ExpenseTripAlreadyIncludedError,
    )
    expect(context.ports.tripLinks).toHaveLength(1)
  })

  it('viagem não concluída, de outro motorista ou sem parcela → 409', async () => {
    const attempts = [
      [TRIP_OPEN, ExpenseTripNotCompletedError],
      [TRIP_OTHER_DRIVER, ExpenseTripNotPayeeError],
      [TRIP_GAP, ExpenseTripParcelMissingError],
    ] as const

    for (const [tripId, error] of attempts) {
      const failure = await include(context.ports, context.firstFortnight, tripId).catch(
        (e: unknown) => e,
      )
      expect(failure).toBeInstanceOf(error)
      expect((failure as ApiError).status).toBe(409)
    }
    expect(context.ports.tripLinks).toEqual([])
  })

  it('viagem e ocorrência de outra empresa → 404, sem revelar existência', async () => {
    await expect(
      include(context.ports, context.firstFortnight, TRIP_OTHER_COMPANY),
    ).rejects.toBeInstanceOf(ExpenseTripNotFoundError)
    await expect(
      include(context.ports, context.firstFortnight, TRIP_1, COMPANY_B),
    ).rejects.toBeInstanceOf(ExpenseOccurrenceNotFoundError)
    await expect(
      createListExpenseOccurrenceTripsUseCase(context.ports).execute({
        companyId: COMPANY_B,
        occurrenceId: context.firstFortnight,
      }),
    ).rejects.toBeInstanceOf(ExpenseOccurrenceNotFoundError)
  })

  it('ocorrência paga é imutável: nem inclui nem remove (409)', async () => {
    await include(context.ports, context.firstFortnight, TRIP_1)
    await createSettleExpenseOccurrenceUseCase(context.ports.base).execute({
      companyId: COMPANY_A,
      occurrenceId: context.firstFortnight,
      paidAmount: '600.00',
      paidAt: '2026-11-15',
      settledBy: USER_ID,
      settlementNote: null,
    })

    await expect(include(context.ports, context.firstFortnight, TRIP_2)).rejects.toBeInstanceOf(
      ExpenseOccurrenceAlreadyPaidError,
    )
    await expect(
      createRemoveExpenseOccurrenceTripUseCase(context.ports).execute({
        companyId: COMPANY_A,
        occurrenceId: context.firstFortnight,
        removedBy: USER_ID,
        tripId: TRIP_1,
      }),
    ).rejects.toBeInstanceOf(ExpenseOccurrenceAlreadyPaidError)
    expect(context.ports.tripLinks).toHaveLength(1)
  })

  it('remover viagem que não está na ocorrência → 404', async () => {
    await expect(
      createRemoveExpenseOccurrenceTripUseCase(context.ports).execute({
        companyId: COMPANY_A,
        occurrenceId: context.firstFortnight,
        removedBy: USER_ID,
        tripId: TRIP_2,
      }),
    ).rejects.toBeInstanceOf(ExpenseOccurrenceTripNotFoundError)
  })

  it('conta sem favorecido não recebe viagem (409)', async () => {
    await createCreateExpenseUseCase(context.ports.base).execute({
      categoryId: CATEGORY_RENT_ID,
      companyId: COMPANY_A,
      createdBy: USER_ID,
      dueDay: 5,
      expectedAmount: '1500.00',
      kind: 'fixed',
      name: 'Aluguel',
      recurrence: 'monthly',
      today: '2026-11-13',
    })
    const rent = context.ports.base.occurrenceRows.find(
      (row) => row.expectedAmount === '1500.00' && row.competence === '2026-11',
    )

    await expect(include(context.ports, rent?.id ?? '', TRIP_1)).rejects.toBeInstanceOf(
      ExpenseOccurrenceNotDriverPaymentError,
    )
  })

  it('audita inclusão e remoção com expenses.manage implícito na trilha, sem dado pessoal', async () => {
    await include(context.ports, context.firstFortnight, TRIP_1)
    await createRemoveExpenseOccurrenceTripUseCase(context.ports).execute({
      companyId: COMPANY_A,
      occurrenceId: context.firstFortnight,
      removedBy: USER_ID,
      tripId: TRIP_1,
    })

    const actions = context.ports.base.auditRows.map((row) => row.action)
    expect(actions).toContain('expense.occurrence.trip.included')
    expect(actions).toContain('expense.occurrence.trip.removed')
    const included = context.ports.base.auditRows.find(
      (row) => row.action === 'expense.occurrence.trip.included',
    )
    expect(Object.keys(included?.metadata ?? {}).sort()).toEqual([
      'amount',
      'expectedAmount',
      'parcelKind',
      'tripId',
    ])
  })
})

function buildRoutes(ports: InMemoryExpenseTrips) {
  const base = ports.base
  return createExpenseRoutes({
    cancelOccurrence: createCancelExpenseOccurrenceUseCase(base),
    createCategory: createCreateExpenseCategoryUseCase(base),
    createExpense: createCreateExpenseUseCase(base),
    includeOccurrenceTrip: createIncludeExpenseOccurrenceTripUseCase(ports),
    listAvailableTrips: createListAvailableExpenseTripsUseCase(ports),
    listCategories: createListExpenseCategoriesUseCase(base),
    listExpenses: createListExpensesUseCase(base),
    listOccurrences: createListExpenseOccurrencesUseCase(base),
    listOccurrenceTrips: createListExpenseOccurrenceTripsUseCase(ports),
    now: () => new Date('2026-11-13T15:00:00Z'),
    removeOccurrenceTrip: createRemoveExpenseOccurrenceTripUseCase(ports),
    setCategoryActive: createSetExpenseCategoryActiveUseCase(base),
    settleOccurrence: createSettleExpenseOccurrenceUseCase(base),
    updateExpense: createUpdateExpenseUseCase(base),
  })
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

function call(
  routes: ReturnType<typeof buildRoutes>,
  input: {
    readonly body?: unknown
    readonly companyId?: string
    readonly method: string
    readonly parameters: Record<string, string>
    readonly path: string
    readonly pathname: string
  },
): Promise<Response> {
  const route = routes.find((r) => r.method === input.method && r.pathname === input.pathname)
  if (route === undefined) throw new Error(`missing route ${input.method} ${input.pathname}`)
  return route.execute({
    context: contextOf(input.companyId ?? COMPANY_A),
    correlationId: 'expense-trips-contract',
    pathParameters: input.parameters,
    request: new Request(`http://api.test${input.path}`, {
      ...(input.body === undefined
        ? {}
        : { body: JSON.stringify(input.body), headers: { 'content-type': 'application/json' } }),
      method: input.method,
    }),
  })
}

describe('rotas das viagens do pagamento (spec 325 CA03/CA04)', () => {
  it('leitura pede expenses.read e escrita pede expenses.manage', async () => {
    const { ports } = await setup()
    const permissions = buildRoutes(ports)
      .filter((route) => route.pathname.includes('trips'))
      .map((route) => [route.method, route.pathname, route.policy?.permission])

    expect(permissions).toEqual([
      ['GET', '/expense-occurrences/:id/trips', 'expenses.read'],
      ['GET', '/expense-occurrences/:id/available-trips', 'expenses.read'],
      ['POST', '/expense-occurrences/:id/trips', 'expenses.manage'],
      ['DELETE', '/expense-occurrences/:id/trips/:tripId', 'expenses.manage'],
    ])
  })

  it('inclui pela rota (201) e responde a ocorrência com o previsto novo; remove pela rota', async () => {
    const { firstFortnight, ports } = await setup()
    const routes = buildRoutes(ports)

    const created = await call(routes, {
      body: { tripId: TRIP_1 },
      method: 'POST',
      parameters: { id: firstFortnight },
      path: '/x',
      pathname: '/expense-occurrences/:id/trips',
    })
    const body = (await created.json()) as {
      data: {
        items: { amount: string; tripId: string }[]
        occurrence: { expectedAmount: string }
        tripsTotal: string
      }
    }
    expect(created.status).toBe(201)
    expect(body.data.items).toEqual([
      {
        amount: '600.00',
        completedOn: '2026-11-03',
        dailyAmount: '200.0000',
        days: 3,
        parcelKind: 'driver',
        tripId: TRIP_1,
      },
    ] as never)
    expect(body.data.occurrence.expectedAmount).toBe('600.00')
    expect(body.data.tripsTotal).toBe('600.00')

    const removed = await call(routes, {
      method: 'DELETE',
      parameters: { id: firstFortnight, tripId: TRIP_1 },
      path: '/x',
      pathname: '/expense-occurrences/:id/trips/:tripId',
    })
    expect(removed.status).toBe(200)
    expect(ports.tripLinks).toEqual([])
  })

  it('período inválido, chave desconhecida ou campo a mais no corpo → 400', async () => {
    const { firstFortnight, ports } = await setup()
    const routes = buildRoutes(ports)

    for (const query of ['?from=2026-11-01', '?from=2026-11-30&to=2026-11-01', '?foo=1']) {
      const error = await call(routes, {
        method: 'GET',
        parameters: { id: firstFortnight },
        path: `/expense-occurrences/x/available-trips${query}`,
        pathname: '/expense-occurrences/:id/available-trips',
      }).catch((e: unknown) => e)
      expect((error as ApiError).status).toBe(400)
    }
    const extra = await call(routes, {
      body: { companyId: COMPANY_B, tripId: TRIP_1 },
      method: 'POST',
      parameters: { id: firstFortnight },
      path: '/x',
      pathname: '/expense-occurrences/:id/trips',
    }).catch((e: unknown) => e)
    expect((extra as ApiError).status).toBe(400)
  })

  it('ocorrência de outra empresa → 404 na rota', async () => {
    const { firstFortnight, ports } = await setup()
    const error = await call(buildRoutes(ports), {
      companyId: COMPANY_B,
      method: 'GET',
      parameters: { id: firstFortnight },
      path: '/x',
      pathname: '/expense-occurrences/:id/trips',
    }).catch((e: unknown) => e)
    expect((error as ApiError).status).toBe(404)
  })
})
