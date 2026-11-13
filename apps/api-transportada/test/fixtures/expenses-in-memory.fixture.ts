/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.1: portas em memória do módulo Contas, para os contratos dos casos de uso
 * (padrão da 169). O contrato fixa a forma das portas que a T1.4 implementa com Drizzle.
 */
import type {
  CompanyExpense,
  CompanyExpenseCategory,
  CompanyExpenseOccurrence,
  ExpenseDriverRef,
  ExpensesPorts,
} from '../../src/expenses/application/expense.port.js'

export const COMPANY_A = '00000000-0000-4000-8000-0000000000a1'
export const COMPANY_B = '00000000-0000-4000-8000-0000000000b1'
export const USER_ID = '00000000-0000-4000-8000-000000000001'

export const CATEGORY_RENT_ID = '00000000-0000-4000-8000-00000000c001'
export const CATEGORY_DRIVER_ID = '00000000-0000-4000-8000-00000000c002'
export const DRIVER_A_ID = '00000000-0000-4000-8000-00000000d001'
export const DRIVER_B_ID = '00000000-0000-4000-8000-00000000d002'

export type InMemoryExpenses = ExpensesPorts & {
  readonly expenseRows: CompanyExpense[]
  readonly occurrenceRows: CompanyExpenseOccurrence[]
}

export function buildInMemoryExpenses(): InMemoryExpenses {
  const expenseRows: CompanyExpense[] = []
  const occurrenceRows: CompanyExpenseOccurrence[] = []
  const categories: (CompanyExpenseCategory & { readonly companyId: string })[] = [
    {
      active: true,
      companyId: COMPANY_A,
      id: CATEGORY_RENT_ID,
      name: 'Aluguel',
      requiresDriver: false,
    },
    {
      active: true,
      companyId: COMPANY_A,
      id: CATEGORY_DRIVER_ID,
      name: 'Pagamento de motorista/agregado',
      requiresDriver: true,
    },
  ]
  const drivers: (ExpenseDriverRef & { readonly companyId: string })[] = [
    { companyId: COMPANY_A, id: DRIVER_A_ID, paymentModel: 'route_table' },
    { companyId: COMPANY_B, id: DRIVER_B_ID, paymentModel: 'fixed' },
  ]

  return {
    categories: {
      findById: async ({ categoryId, companyId }) =>
        categories.find((c) => c.id === categoryId && c.companyId === companyId) ?? null,
    },
    drivers: {
      findById: async ({ companyId, driverId }) =>
        drivers.find((d) => d.id === driverId && d.companyId === companyId) ?? null,
    },
    expenseRows,
    expenses: {
      create: async (input) => {
        const row: CompanyExpense = { active: true, id: crypto.randomUUID(), ...input }
        expenseRows.push(row)
        return row
      },
      findById: async ({ companyId, expenseId }) =>
        expenseRows.find((e) => e.id === expenseId && e.companyId === companyId) ?? null,
      listActiveFixed: async ({ companyId }) =>
        expenseRows.filter((e) => e.companyId === companyId && e.active && e.kind === 'fixed'),
    },
    occurrenceRows,
    occurrences: {
      // unique (conta, competência): ON CONFLICT DO NOTHING devolve false
      insertIfAbsent: async (input) => {
        const exists = occurrenceRows.some(
          (o) => o.expenseId === input.expenseId && o.competence === input.competence,
        )
        if (exists) return false
        occurrenceRows.push({
          id: crypto.randomUUID(),
          paidAmount: null,
          paidAt: null,
          paidBy: null,
          settlementNote: null,
          status: 'open',
          ...input,
        })
        return true
      },
      findById: async ({ companyId, occurrenceId }) =>
        occurrenceRows.find((o) => o.id === occurrenceId && o.companyId === companyId) ?? null,
      markPaid: async ({ occurrenceId, ...paid }) => {
        const row = occurrenceRows.find((o) => o.id === occurrenceId)
        if (row === undefined) return null
        Object.assign(row, { status: 'paid', ...paid })
        return row
      },
    },
  }
}
