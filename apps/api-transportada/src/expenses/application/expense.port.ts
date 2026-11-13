/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.1: forma das portas do módulo Contas, fixada pelos contratos de `test/expenses/`.
 * A T1.2 (schema) e a T1.4 (Drizzle) implementam; dinheiro é `numeric` em string, nunca float.
 */
export type ExpenseKind = 'fixed' | 'variable'
export type ExpenseRecurrence = 'monthly' | 'bimonthly' | 'quarterly' | 'yearly' | 'fortnightly'
export type ExpenseOccurrenceStatus = 'open' | 'paid' | 'canceled'

export type CompanyExpenseCategory = {
  readonly active: boolean
  readonly id: string
  readonly name: string
  /** Semeada "Pagamento de motorista/agregado" exige `payee_driver_id`; as demais o recusam. */
  readonly requiresDriver: boolean
}

export type ExpenseDriverRef = {
  readonly id: string
  readonly paymentModel: 'fixed' | 'route_table'
}

export type CompanyExpense = {
  readonly active: boolean
  readonly categoryId: string
  readonly companyId: string
  readonly dueDay: number | null
  readonly expectedAmount: string
  readonly id: string
  readonly kind: ExpenseKind
  readonly name: string
  readonly payeeDriverId: string | null
  readonly recurrence: ExpenseRecurrence | null
  /** Dúvida 2: veículo opcional (`fleet_vehicles`), sem rateio. */
  readonly vehicleId?: string | null
}

export type CompanyExpenseOccurrence = {
  readonly companyId: string
  /** `yyyy-mm`. */
  readonly competence: string
  /** `yyyy-mm-dd`. */
  readonly dueDate: string
  readonly expectedAmount: string
  readonly expenseId: string
  readonly id: string
  readonly paidAmount: string | null
  readonly paidAt: string | null
  readonly paidBy: string | null
  readonly settlementNote: string | null
  readonly status: ExpenseOccurrenceStatus
}

export type ExpensesPorts = {
  readonly categories: {
    findById(input: {
      categoryId: string
      companyId: string
    }): Promise<CompanyExpenseCategory | null>
  }
  readonly drivers: {
    findById(input: { companyId: string; driverId: string }): Promise<ExpenseDriverRef | null>
  }
  readonly expenses: {
    create(input: Omit<CompanyExpense, 'active' | 'id'>): Promise<CompanyExpense>
    findById(input: { companyId: string; expenseId: string }): Promise<CompanyExpense | null>
    listActiveFixed(input: { companyId: string }): Promise<readonly CompanyExpense[]>
  }
  readonly occurrences: {
    findById(input: {
      companyId: string
      occurrenceId: string
    }): Promise<CompanyExpenseOccurrence | null>
    /** Única por (conta, competência): `ON CONFLICT DO NOTHING`; devolve `false` se já existia. */
    insertIfAbsent(
      input: Pick<
        CompanyExpenseOccurrence,
        'companyId' | 'competence' | 'dueDate' | 'expectedAmount' | 'expenseId'
      >,
    ): Promise<boolean>
    markPaid(input: {
      occurrenceId: string
      paidAmount: string
      paidAt: string
      paidBy: string
      settlementNote: string | null
    }): Promise<CompanyExpenseOccurrence | null>
  }
}
