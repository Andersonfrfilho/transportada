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
  /** Total de parcelas da conta (spec 325, extensão parcelas); nulo = sem fim. */
  readonly installmentsTotal: number | null
  readonly recurrence: ExpenseRecurrence
}

export type ExpenseOccurrenceToInsert = {
  readonly companyId: string
  readonly competence: string
  readonly dueDate: string
  readonly expectedAmount: string
  readonly expenseId: string
  /** Número da parcela quando a conta é parcelada; nulo nas demais. */
  readonly installmentNumber: number | null
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
