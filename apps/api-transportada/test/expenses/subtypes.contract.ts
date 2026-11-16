/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 331: cada categoria tem os próprios tipos (Cartão de crédito → Mercado Pago, Nubank). O tipo nasce digitando e
 * Enter, é da categoria e da empresa, e a conta que o usa soma na mesma fatura, parcelada ou à vista.
 */
import { describe, expect, it } from 'bun:test'

import {
  createCreateExpenseSubtypeUseCase,
  createCreateExpenseUseCase,
  createListExpenseSubtypesUseCase,
  createUpdateExpenseUseCase,
} from '../../src/expenses/application/expense.use-case.js'
import {
  ExpenseCategoryNotFoundError,
  ExpenseInvalidScheduleError,
  ExpenseSubtypeNotFoundError,
} from '../../src/expenses/domain/expense.error.js'
import {
  buildInMemoryExpenses,
  CATEGORY_DRIVER_ID,
  CATEGORY_RENT_ID,
  COMPANY_A,
  COMPANY_B,
  USER_ID,
} from '../fixtures/expenses-in-memory.fixture.js'

const base = {
  categoryId: CATEGORY_RENT_ID,
  companyId: COMPANY_A,
  createdBy: USER_ID,
  dueDate: '2026-11-20',
  expectedAmount: '300.00',
  kind: 'variable' as const,
  name: 'Compra no mercado',
  today: '2026-11-13',
}

describe('tipos dentro da categoria (spec 331)', () => {
  it('cria o tipo digitando e devolve o mesmo quando o nome já existe, sem diferenciar caixa', async () => {
    const ports = buildInMemoryExpenses()
    const create = createCreateExpenseSubtypeUseCase(ports)
    const first = await create.execute({
      categoryId: CATEGORY_RENT_ID,
      companyId: COMPANY_A,
      createdBy: USER_ID,
      name: '  Mercado Pago ',
    })
    expect(first.name).toBe('Mercado Pago')
    const again = await create.execute({
      categoryId: CATEGORY_RENT_ID,
      companyId: COMPANY_A,
      createdBy: USER_ID,
      name: 'mercado pago',
    })
    expect(again.id).toBe(first.id)
    const listed = await createListExpenseSubtypesUseCase(ports).execute({ companyId: COMPANY_A })
    expect(listed).toHaveLength(1)
    expect(ports.auditRows.filter((row) => row.action === 'expense.subtype.created')).toHaveLength(
      1,
    )
  })

  it('recusa nome vazio e categoria que não é da empresa', async () => {
    const ports = buildInMemoryExpenses()
    const create = createCreateExpenseSubtypeUseCase(ports)
    expect(
      create.execute({
        categoryId: CATEGORY_RENT_ID,
        companyId: COMPANY_A,
        createdBy: USER_ID,
        name: ' ',
      }),
    ).rejects.toBeInstanceOf(ExpenseInvalidScheduleError)
    expect(
      create.execute({
        categoryId: CATEGORY_RENT_ID,
        companyId: COMPANY_B,
        createdBy: USER_ID,
        name: 'X',
      }),
    ).rejects.toBeInstanceOf(ExpenseCategoryNotFoundError)
  })

  it('a conta usa o tipo da própria categoria, parcelada ou à vista', async () => {
    const ports = buildInMemoryExpenses()
    const subtype = await createCreateExpenseSubtypeUseCase(ports).execute({
      categoryId: CATEGORY_RENT_ID,
      companyId: COMPANY_A,
      createdBy: USER_ID,
      name: 'Nubank',
    })
    const cash = await createCreateExpenseUseCase(ports).execute({ ...base, subtypeId: subtype.id })
    const fixedBase = {
      categoryId: base.categoryId,
      companyId: base.companyId,
      createdBy: base.createdBy,
      expectedAmount: base.expectedAmount,
      today: base.today,
    }
    const installments = await createCreateExpenseUseCase(ports).execute({
      ...fixedBase,
      dueDay: 10,
      installmentsTotal: 6,
      kind: 'fixed',
      name: 'Geladeira',
      recurrence: 'monthly',
      subtypeId: subtype.id,
    })
    expect(cash.subtypeId).toBe(subtype.id)
    expect(installments.subtypeId).toBe(subtype.id)
  })

  it('recusa tipo de outra categoria ou inexistente', async () => {
    const ports = buildInMemoryExpenses()
    const other = await createCreateExpenseSubtypeUseCase(ports).execute({
      categoryId: CATEGORY_DRIVER_ID,
      companyId: COMPANY_A,
      createdBy: USER_ID,
      name: 'Outro',
    })
    for (const subtypeId of [other.id, crypto.randomUUID()]) {
      expect(
        createCreateExpenseUseCase(ports).execute({ ...base, subtypeId }),
      ).rejects.toBeInstanceOf(ExpenseSubtypeNotFoundError)
    }
  })

  it('na edição troca e limpa o tipo', async () => {
    const ports = buildInMemoryExpenses()
    const subtype = await createCreateExpenseSubtypeUseCase(ports).execute({
      categoryId: CATEGORY_RENT_ID,
      companyId: COMPANY_A,
      createdBy: USER_ID,
      name: 'Nubank',
    })
    const expense = await createCreateExpenseUseCase(ports).execute(base)
    const update = createUpdateExpenseUseCase(ports)
    const set = await update.execute({
      companyId: COMPANY_A,
      expenseId: expense.id,
      subtypeId: subtype.id,
      updatedBy: USER_ID,
    })
    expect(set.subtypeId).toBe(subtype.id)
    const cleared = await update.execute({
      companyId: COMPANY_A,
      expenseId: expense.id,
      subtypeId: null,
      updatedBy: USER_ID,
    })
    expect(cleared.subtypeId).toBeNull()
  })
})
