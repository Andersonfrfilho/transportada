/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T2.1: a resposta de `/expenses*` é entrada não confiável e vira dinheiro pago; o guard recusa forma
 * inesperada em vez de deixar `undefined` vazar para a tela, e o vocabulário daqui bate com o da API.
 */
import { describe, expect, it } from 'bun:test'

import {
  EXPENSE_KINDS,
  EXPENSE_OCCURRENCE_STATUSES,
  EXPENSE_RECURRENCES,
} from '@/modules/expenses/shared/expenses.types'
import {
  ExpenseResponseError,
  toAvailableTrips,
  toCategories,
  toExpenses,
  toOccurrencePage,
  toOccurrenceTrips,
} from '@/modules/expenses/shared/expensesResponse.validation'

import expensesEnLocale from '@/modules/expenses/locales/expenses.en.locale.json'
import expensesLocale from '@/modules/expenses/locales/expenses.locale.json'

const OCCURRENCE = {
  competence: '2026-11',
  dueDate: '2026-11-05',
  expectedAmount: '1500.00',
  expenseId: 'expense-1',
  id: 'occurrence-1',
  paidAmount: null,
  paidAt: null,
  paidBy: null,
  settlementNote: null,
  slot: 1,
  status: 'open',
}

const LIST_ITEM = {
  ...OCCURRENCE,
  categoryId: 'category-1',
  categoryName: 'Aluguel',
  expenseKind: 'fixed',
  expenseName: 'Aluguel do galpão',
  payeeDriverId: null,
  payeeDriverName: null,
  payeeDriverPaymentModel: null,
}

const TRIP = {
  amount: '600.00',
  completedOn: '2026-11-03',
  dailyAmount: '200.0000',
  days: 3,
  parcelKind: 'driver',
  tripId: 'trip-1',
}

describe('expenses response guard', () => {
  it('lê a lista de ocorrências com os totais, sempre como texto', () => {
    const page = toOccurrencePage({
      data: [LIST_ITEM],
      totals: {
        count: 1,
        expectedAmount: '1500.00',
        paidAmount: '0.00',
        paidByDriver: [{ driverId: 'driver-1', driverName: null, paidAmount: '10.50' }],
      },
    })
    expect(page.items[0]?.expectedAmount).toBe('1500.00')
    expect(page.totals.paidByDriver[0]?.paidAmount).toBe('10.50')
  })

  it('lê o perfil do favorecido quando vem e tolera a API sem ele', () => {
    const totals = { count: 1, expectedAmount: '1.00', paidAmount: '0.00', paidByDriver: [] }
    const withProfile = toOccurrencePage({
      data: [{ ...LIST_ITEM, payeeProfile: 'helper' }],
      totals,
    })
    expect(withProfile.items[0]?.payeeProfile).toBe('helper')
    expect(toOccurrencePage({ data: [LIST_ITEM], totals }).items[0]?.payeeProfile).toBeUndefined()
    expect(() =>
      toOccurrencePage({ data: [{ ...LIST_ITEM, payeeProfile: 'boss' }], totals }),
    ).toThrow(ExpenseResponseError)
  })

  it('recusa valor numérico no lugar do texto de dinheiro', () => {
    expect(() =>
      toOccurrencePage({
        data: [{ ...LIST_ITEM, expectedAmount: 1500 }],
        totals: { count: 1, expectedAmount: '1.00', paidAmount: '0.00', paidByDriver: [] },
      }),
    ).toThrow(ExpenseResponseError)
  })

  it('recusa estado, tipo ou recorrência fora do vocabulário', () => {
    const totals = { count: 1, expectedAmount: '1.00', paidAmount: '0.00', paidByDriver: [] }
    expect(() => toOccurrencePage({ data: [{ ...LIST_ITEM, status: 'late' }], totals })).toThrow(
      ExpenseResponseError,
    )
    expect(() =>
      toOccurrencePage({ data: [{ ...LIST_ITEM, expenseKind: 'once' }], totals }),
    ).toThrow(ExpenseResponseError)
    expect(() =>
      toExpenses({
        data: [
          {
            active: true,
            categoryId: 'c',
            dueDay: 5,
            expectedAmount: '1.00',
            id: 'e',
            kind: 'fixed',
            name: 'x',
            payeeDriverId: null,
            recurrence: 'weekly',
            vehicleId: null,
          },
        ],
      }),
    ).toThrow(ExpenseResponseError)
  })

  it('recusa resposta sem `data` e ocorrência sem `slot` válido', () => {
    expect(() => toCategories({})).toThrow(ExpenseResponseError)
    expect(() =>
      toOccurrencePage({
        data: [{ ...LIST_ITEM, slot: 3 }],
        totals: { count: 1, expectedAmount: '1.00', paidAmount: '0.00', paidByDriver: [] },
      }),
    ).toThrow(ExpenseResponseError)
  })

  it('lê as viagens do pagamento e as disponíveis', () => {
    const trips = toOccurrenceTrips({
      data: { items: [TRIP], occurrence: OCCURRENCE, tripsTotal: '600.00' },
    })
    expect(trips.items[0]?.days).toBe(3)
    expect(trips.tripsTotal).toBe('600.00')

    const available = toAvailableTrips({
      data: {
        available: [TRIP],
        pending: [
          {
            completedOn: '2026-11-04',
            gap: 'NO_PLANNED_DURATION',
            parcelKind: 'helper',
            tripId: 'trip-2',
          },
        ],
        period: { from: '2026-11-01', to: '2026-11-30' },
      },
    })
    expect(available.pending[0]?.parcelKind).toBe('helper')
  })

  it('o vocabulário daqui é o da API', async () => {
    const schema = await Bun.file(
      new URL('../../../api-transportada/src/database/company-expense.schema.ts', import.meta.url),
    ).text()
    for (const value of [
      ...EXPENSE_KINDS,
      ...EXPENSE_RECURRENCES,
      ...EXPENSE_OCCURRENCE_STATUSES,
    ]) {
      expect(schema).toContain(`'${value}'`)
    }
  })

  it('pt e en têm as mesmas chaves, com todo estado, tipo e recorrência traduzido', () => {
    function keys(value: unknown, prefix = ''): string[] {
      if (typeof value !== 'object' || value === null) return [prefix]
      return Object.entries(value).flatMap(([key, child]) =>
        keys(child, prefix === '' ? key : `${prefix}.${key}`),
      )
    }
    expect(keys(expensesEnLocale).sort()).toEqual(keys(expensesLocale).sort())
    for (const kind of EXPENSE_KINDS) expect(expensesLocale.kind[kind]).toBeString()
    for (const recurrence of EXPENSE_RECURRENCES) {
      expect(expensesLocale.recurrence[recurrence]).toBeString()
    }
    for (const status of EXPENSE_OCCURRENCE_STATUSES) {
      expect(expensesLocale.status[status]).toBeString()
    }
  })
})
