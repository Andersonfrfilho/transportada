/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325: cadastro da conta. Esqueleto da T1.1 — a T1.4 implementa.
 */
import type { CompanyExpense, ExpenseRecurrence, ExpensesPorts } from './expense.port.js'

export type CreateExpenseInput = {
  readonly categoryId: string
  readonly companyId: string
  readonly createdBy: string
  readonly dueDate?: string
  readonly dueDay?: number
  readonly expectedAmount: string
  readonly kind: 'fixed' | 'variable'
  readonly name: string
  readonly payeeDriverId?: string
  readonly recurrence?: ExpenseRecurrence
  /** `yyyy-mm-dd` civil de America/Sao_Paulo, injetado para o teste ser determinístico. */
  readonly today: string
}

export function createCreateExpenseUseCase(ports: ExpensesPorts): {
  execute(input: CreateExpenseInput): Promise<CompanyExpense>
} {
  void ports
  return {
    execute: async () => {
      throw new Error('spec 325 T1.4: createCreateExpenseUseCase not implemented')
    },
  }
}
