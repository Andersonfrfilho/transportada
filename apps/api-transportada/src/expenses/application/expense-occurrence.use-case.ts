/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325: baixa e geração das ocorrências. Esqueleto da T1.1 — a T1.4/T1.5 implementam.
 */
import type { CompanyExpenseOccurrence, ExpensesPorts } from './expense.port.js'

export type SettleExpenseOccurrenceInput = {
  readonly companyId: string
  readonly occurrenceId: string
  readonly paidAmount: string
  /** `yyyy-mm-dd`. */
  readonly paidAt: string
  readonly settledBy: string
  readonly settlementNote: string | null
}

export function createSettleExpenseOccurrenceUseCase(ports: ExpensesPorts): {
  execute(input: SettleExpenseOccurrenceInput): Promise<CompanyExpenseOccurrence>
} {
  void ports
  return {
    execute: async () => {
      throw new Error('spec 325 T1.4: createSettleExpenseOccurrenceUseCase not implemented')
    },
  }
}

export type GenerateExpenseOccurrencesInput = {
  readonly companyId: string
  readonly today: string
}

/** Idempotente: gera o mês corrente e os 3 seguintes das contas fixas ativas. */
export function createGenerateExpenseOccurrencesUseCase(ports: ExpensesPorts): {
  execute(input: GenerateExpenseOccurrencesInput): Promise<void>
} {
  void ports
  return {
    execute: async () => {
      throw new Error('spec 325 T1.5: createGenerateExpenseOccurrencesUseCase not implemented')
    },
  }
}
