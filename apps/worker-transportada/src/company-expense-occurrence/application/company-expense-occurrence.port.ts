/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ExpenseRecurrence } from '../domain/expense-schedule.policy.js'

export type ActiveFixedExpense = {
  /** `yyyy-mm` em que a conta começou (data de criação em America/Sao_Paulo): é a âncora das recorrências longas. */
  readonly anchorCompetence: string
  readonly companyId: string
  readonly dueDay: number | null
  readonly expectedAmount: string
  readonly id: string
  readonly recurrence: ExpenseRecurrence
}

export type ExpenseOccurrenceToInsert = {
  readonly companyId: string
  readonly competence: string
  readonly dueDate: string
  readonly expectedAmount: string
  readonly expenseId: string
  readonly slot: 1 | 2
}

export type CompanyExpenseOccurrencePorts = {
  /** Contas fixas ativas de **uma** empresa. */
  listActiveFixed(input: { readonly companyId: string }): Promise<readonly ActiveFixedExpense[]>
  /** Empresas que têm ao menos uma conta fixa ativa. */
  listCompaniesWithActiveFixed(): Promise<readonly string[]>
  /** `ON CONFLICT DO NOTHING` na chave `(conta, competência, slot)`; diz se a linha nasceu. */
  insertIfAbsent(input: ExpenseOccurrenceToInsert): Promise<boolean>
}
