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
  /** `yyyy-mm` em que a conta começou: bimestral/trimestral/anual contam a partir dele. Sem ele, vale a janela. */
  readonly anchorCompetence?: string
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
  /** 1 em toda recorrência; na quinzenal, 1 = dia 15 e 2 = último dia. */
  readonly slot?: 1 | 2
  readonly status: ExpenseOccurrenceStatus
}

/** Linha da lista de ocorrências: a ocorrência com o que a tela precisa da conta (nome, categoria, motorista). */
export type ExpenseOccurrenceListItem = CompanyExpenseOccurrence & {
  readonly categoryId: string
  readonly categoryName: string
  readonly expenseKind: ExpenseKind
  readonly expenseName: string
  readonly payeeDriverId: string | null
  /** Derivado do cadastro na leitura, nunca copiado (RF1b). */
  readonly payeeDriverName: string | null
  readonly payeeDriverPaymentModel: ExpenseDriverRef['paymentModel'] | null
}

export type ExpenseOccurrenceFilters = {
  readonly categoryId?: string
  /** `yyyy-mm`. */
  readonly competence?: string
  readonly driverId?: string
  readonly kind?: ExpenseKind
  readonly status?: ExpenseOccurrenceStatus
}

export type ExpenseAuditEntry = {
  readonly action: string
  readonly actorUserId: string
  readonly companyId: string
  readonly correlationId: string
  readonly entityId: string
  readonly entityType: 'company_expense' | 'company_expense_category' | 'company_expense_occurrence'
  readonly metadata: Record<string, unknown>
}

export type ExpensesPorts = {
  /** RF9: a trilha grava a permissão `expenses.manage` (toda escrita do módulo exige ela). */
  readonly audit: {
    append(entry: ExpenseAuditEntry): Promise<void>
  }
  readonly categories: {
    create(input: {
      companyId: string
      name: string
    }): Promise<CompanyExpenseCategory | 'name_taken'>
    /** Primeiro uso da empresa: grava as 8 categorias da semente se ela ainda não tem nenhuma. Idempotente. */
    ensureSeeded(input: { companyId: string }): Promise<void>
    findById(input: {
      categoryId: string
      companyId: string
    }): Promise<CompanyExpenseCategory | null>
    list(input: { companyId: string }): Promise<readonly CompanyExpenseCategory[]>
    setActive(input: {
      active: boolean
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
    list(input: { companyId: string }): Promise<readonly CompanyExpense[]>
    listActiveFixed(input: { companyId: string }): Promise<readonly CompanyExpense[]>
    /** RF5: vale dali para frente; ocorrência já gerada não é reescrita. */
    update(input: {
      active?: boolean
      companyId: string
      dueDay?: number | null
      expectedAmount?: string
      expenseId: string
      name?: string
      vehicleId?: string | null
    }): Promise<CompanyExpense | null>
  }
  readonly occurrences: {
    /** `open` → `canceled` numa instrução só; `null` quando não existe ou já não está aberta. */
    cancel(input: {
      canceledBy: string
      companyId: string
      occurrenceId: string
      reason: string
    }): Promise<CompanyExpenseOccurrence | null>
    findById(input: {
      companyId: string
      occurrenceId: string
    }): Promise<CompanyExpenseOccurrence | null>
    /** Única por (conta, competência, slot): `ON CONFLICT DO NOTHING`; devolve `false` se já existia. */
    insertIfAbsent(
      input: Pick<
        CompanyExpenseOccurrence,
        'companyId' | 'competence' | 'dueDate' | 'expectedAmount' | 'expenseId'
      > & { readonly slot: 1 | 2 },
    ): Promise<boolean>
    list(input: {
      companyId: string
      filters: ExpenseOccurrenceFilters
    }): Promise<readonly ExpenseOccurrenceListItem[]>
    /** Só baixa o que está `open`; `null` quando não existe ou já não está aberta (corrida). */
    markPaid(input: {
      occurrenceId: string
      paidAmount: string
      paidAt: string
      paidBy: string
      settlementNote: string | null
    }): Promise<CompanyExpenseOccurrence | null>
  }
}
