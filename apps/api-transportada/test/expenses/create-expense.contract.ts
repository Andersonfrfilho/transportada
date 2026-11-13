/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 RF1b, CA05b, CA04: motorista obrigatório na categoria de motorista, recusado nas demais,
 * e motorista/categoria de outra empresa não existem (404, sem revelar).
 */
import { describe, expect, it } from 'bun:test'

import { createCreateExpenseUseCase } from '../../src/expenses/application/expense.use-case.js'
import {
  ExpenseCategoryNotFoundError,
  ExpenseDriverNotAllowedError,
  ExpenseDriverNotFoundError,
  ExpenseDriverRequiredError,
} from '../../src/expenses/domain/expense.error.js'
import {
  buildInMemoryExpenses,
  CATEGORY_DRIVER_ID,
  CATEGORY_RENT_ID,
  COMPANY_A,
  COMPANY_B,
  DRIVER_A_ID,
  DRIVER_B_ID,
  USER_ID,
} from '../fixtures/expenses-in-memory.fixture.js'

const base = {
  companyId: COMPANY_A,
  createdBy: USER_ID,
  expectedAmount: '1500.00',
  kind: 'fixed' as const,
  name: 'Aluguel do galpão',
  today: '2026-11-13',
}
const fixedSchedule = { dueDay: 5, recurrence: 'monthly' as const }

describe('cadastrar conta (spec 325)', () => {
  it('cria a conta fixa comum sem motorista', async () => {
    const ports = buildInMemoryExpenses()
    const useCase = createCreateExpenseUseCase(ports)

    const created = await useCase.execute({
      ...base,
      ...fixedSchedule,
      categoryId: CATEGORY_RENT_ID,
    })

    expect(created.name).toBe('Aluguel do galpão')
    expect(created.payeeDriverId ?? null).toBeNull()
  })

  /** RF1b / CA05b: a categoria de motorista exige o motorista. */
  it('categoria de motorista sem motorista → ExpenseDriverRequiredError (400)', async () => {
    const useCase = createCreateExpenseUseCase(buildInMemoryExpenses())

    const attempt = useCase.execute({ ...base, ...fixedSchedule, categoryId: CATEGORY_DRIVER_ID })

    await expect(attempt).rejects.toBeInstanceOf(ExpenseDriverRequiredError)
  })

  it('categoria comum com motorista → ExpenseDriverNotAllowedError (400)', async () => {
    const useCase = createCreateExpenseUseCase(buildInMemoryExpenses())

    const attempt = useCase.execute({
      ...base,
      ...fixedSchedule,
      categoryId: CATEGORY_RENT_ID,
      payeeDriverId: DRIVER_A_ID,
    })

    await expect(attempt).rejects.toBeInstanceOf(ExpenseDriverNotAllowedError)
  })

  it('categoria de motorista com motorista da empresa cria a conta ligada a ele', async () => {
    const useCase = createCreateExpenseUseCase(buildInMemoryExpenses())

    const created = await useCase.execute({
      ...base,
      ...fixedSchedule,
      categoryId: CATEGORY_DRIVER_ID,
      payeeDriverId: DRIVER_A_ID,
    })

    expect(created.payeeDriverId).toBe(DRIVER_A_ID)
  })

  /** CA05b / CA04: motorista de outra empresa → 404, e nada é gravado. */
  it('motorista de outra empresa → ExpenseDriverNotFoundError (404) e nada gravado', async () => {
    const ports = buildInMemoryExpenses()
    const useCase = createCreateExpenseUseCase(ports)

    const attempt = useCase.execute({
      ...base,
      ...fixedSchedule,
      categoryId: CATEGORY_DRIVER_ID,
      payeeDriverId: DRIVER_B_ID,
    })

    await expect(attempt).rejects.toBeInstanceOf(ExpenseDriverNotFoundError)
    expect(ports.expenseRows).toHaveLength(0)
  })

  it('categoria de outra empresa → ExpenseCategoryNotFoundError (404)', async () => {
    const useCase = createCreateExpenseUseCase(buildInMemoryExpenses())

    const attempt = useCase.execute({
      ...base,
      ...fixedSchedule,
      categoryId: CATEGORY_RENT_ID,
      companyId: COMPANY_B,
    })

    await expect(attempt).rejects.toBeInstanceOf(ExpenseCategoryNotFoundError)
  })
})
