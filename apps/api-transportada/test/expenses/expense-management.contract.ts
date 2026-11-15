/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.4: o que vai além dos contratos da T1.1 — categorias no primeiro uso, quinzenal com `slot`,
 * edição "dali para frente" (RF5/CA02), cancelamento (RF6), totais (CA05) e auditoria (RF9).
 */
import { describe, expect, it } from 'bun:test'

import {
  createCancelExpenseOccurrenceUseCase,
  createListExpenseOccurrencesUseCase,
  createSettleExpenseOccurrenceUseCase,
} from '../../src/expenses/application/expense-occurrence.use-case.js'
import {
  createCreateExpenseCategoryUseCase,
  createCreateExpenseUseCase,
  createListExpenseCategoriesUseCase,
  createUpdateExpenseUseCase,
} from '../../src/expenses/application/expense.use-case.js'
import {
  ExpenseCategoryNameTakenError,
  ExpenseInvalidAmountError,
  ExpenseInvalidScheduleError,
  ExpenseNotFoundError,
  ExpenseOccurrenceNotCancelableError,
} from '../../src/expenses/domain/expense.error.js'
import {
  buildInMemoryExpenses,
  CATEGORY_DRIVER_ID,
  CATEGORY_RENT_ID,
  COMPANY_A,
  COMPANY_B,
  DRIVER_A_ID,
  USER_ID,
} from '../fixtures/expenses-in-memory.fixture.js'

const base = {
  categoryId: CATEGORY_RENT_ID,
  companyId: COMPANY_A,
  createdBy: USER_ID,
  expectedAmount: '1500.00',
  today: '2026-11-13',
}

describe('categorias de conta (spec 325 RF2)', () => {
  it('a primeira leitura da empresa garante a semente antes de listar', async () => {
    const ports = buildInMemoryExpenses()

    await createListExpenseCategoriesUseCase(ports).execute({ companyId: COMPANY_B })

    expect(ports.seedCalls).toEqual([COMPANY_B])
  })

  it('criar categoria também garante a semente e recusa nome repetido (409)', async () => {
    const ports = buildInMemoryExpenses()
    const useCase = createCreateExpenseCategoryUseCase(ports)

    await useCase.execute({ companyId: COMPANY_A, createdBy: USER_ID, name: 'Pedágio de pátio' })
    const again = useCase.execute({
      companyId: COMPANY_A,
      createdBy: USER_ID,
      name: 'Pedágio de pátio',
    })

    await expect(again).rejects.toBeInstanceOf(ExpenseCategoryNameTakenError)
    expect(ports.seedCalls).toEqual([COMPANY_A, COMPANY_A])
  })
})

describe('recorrências e slot (spec 325 RF1b, RF4)', () => {
  it('quinzenal gera duas ocorrências por mês (dia 15 = slot 1, último dia = slot 2)', async () => {
    const ports = buildInMemoryExpenses()
    await createCreateExpenseUseCase(ports).execute({
      ...base,
      categoryId: CATEGORY_DRIVER_ID,
      kind: 'fixed',
      name: 'Quinzena do agregado',
      payeeDriverId: DRIVER_A_ID,
      recurrence: 'fortnightly',
    })

    expect(ports.occurrenceRows.slice(0, 4).map((o) => [o.competence, o.slot, o.dueDate])).toEqual([
      ['2026-11', 1, '2026-11-15'],
      ['2026-11', 2, '2026-11-30'],
      ['2026-12', 1, '2026-12-15'],
      ['2026-12', 2, '2026-12-31'],
    ])
    expect(ports.occurrenceRows).toHaveLength(8)
  })

  it('trimestral gera só o mês da âncora dentro da janela de 4 meses', async () => {
    const ports = buildInMemoryExpenses()
    await createCreateExpenseUseCase(ports).execute({
      ...base,
      dueDay: 10,
      kind: 'fixed',
      name: 'Seguro',
      recurrence: 'quarterly',
    })

    expect(ports.occurrenceRows.map((o) => o.competence)).toEqual(['2026-11', '2027-02'])
  })

  it('fixa sem recorrência, fixa mensal sem dia, e variável sem vencimento → 400', async () => {
    const useCase = createCreateExpenseUseCase(buildInMemoryExpenses())

    for (const partial of [
      { kind: 'fixed' as const },
      { kind: 'fixed' as const, recurrence: 'monthly' as const },
      { kind: 'variable' as const },
      { dueDate: '2026-02-30', kind: 'variable' as const },
      { dueDay: 5, kind: 'variable' as const, dueDate: '2026-11-20' },
    ]) {
      await expect(useCase.execute({ ...base, name: 'x', ...partial })).rejects.toBeInstanceOf(
        ExpenseInvalidScheduleError,
      )
    }
  })

  it('valor previsto inválido → 400', async () => {
    const useCase = createCreateExpenseUseCase(buildInMemoryExpenses())

    const attempt = useCase.execute({
      ...base,
      dueDay: 5,
      expectedAmount: '12,50',
      kind: 'fixed',
      name: 'x',
      recurrence: 'monthly',
    })

    await expect(attempt).rejects.toBeInstanceOf(ExpenseInvalidAmountError)
  })
})

describe('editar a conta (spec 325 RF5, CA02)', () => {
  it('o novo valor vale dali para frente: a ocorrência já gerada fica como estava', async () => {
    const ports = buildInMemoryExpenses()
    const expense = await createCreateExpenseUseCase(ports).execute({
      ...base,
      dueDay: 5,
      kind: 'fixed',
      name: 'Aluguel',
      recurrence: 'monthly',
    })

    const updated = await createUpdateExpenseUseCase(ports).execute({
      companyId: COMPANY_A,
      expectedAmount: '1800.00',
      expenseId: expense.id,
      updatedBy: USER_ID,
    })

    expect(updated.expectedAmount).toBe('1800.00')
    expect(ports.occurrenceRows.every((o) => o.expectedAmount === '1500.00')).toBe(true)
  })

  it('conta de outra empresa → ExpenseNotFoundError (404)', async () => {
    const ports = buildInMemoryExpenses()
    const expense = await createCreateExpenseUseCase(ports).execute({
      ...base,
      dueDay: 5,
      kind: 'fixed',
      name: 'Aluguel',
      recurrence: 'monthly',
    })

    const attempt = createUpdateExpenseUseCase(ports).execute({
      companyId: COMPANY_B,
      expenseId: expense.id,
      name: 'invadida',
      updatedBy: USER_ID,
    })

    await expect(attempt).rejects.toBeInstanceOf(ExpenseNotFoundError)
    expect(expense.name).toBe('Aluguel')
  })
})

describe('cancelar, totais e auditoria (spec 325 RF6, RF9, CA05)', () => {
  async function seedVariable(ports: ReturnType<typeof buildInMemoryExpenses>, amount: string) {
    await createCreateExpenseUseCase(ports).execute({
      ...base,
      dueDate: '2026-11-20',
      expectedAmount: amount,
      kind: 'variable',
      name: `Conta ${amount}`,
    })
    return ports.occurrenceRows[ports.occurrenceRows.length - 1]!.id
  }

  it('cancelar exige motivo e só vale para a ocorrência aberta', async () => {
    const ports = buildInMemoryExpenses()
    const occurrenceId = await seedVariable(ports, '100.00')
    const cancel = createCancelExpenseOccurrenceUseCase(ports)

    await expect(
      cancel.execute({ canceledBy: USER_ID, companyId: COMPANY_A, occurrenceId, reason: '  ' }),
    ).rejects.toBeInstanceOf(ExpenseInvalidScheduleError)
    await cancel.execute({
      canceledBy: USER_ID,
      companyId: COMPANY_A,
      occurrenceId,
      reason: 'lançada em duplicidade',
    })
    const again = cancel.execute({
      canceledBy: USER_ID,
      companyId: COMPANY_A,
      occurrenceId,
      reason: 'de novo',
    })

    await expect(again).rejects.toBeInstanceOf(ExpenseOccurrenceNotCancelableError)
  })

  it('o total previsto soma só as não canceladas e o pago soma só as baixas (CA05)', async () => {
    const ports = buildInMemoryExpenses()
    const paidId = await seedVariable(ports, '100.10')
    const canceledId = await seedVariable(ports, '50.00')
    await seedVariable(ports, '25.05')
    await createSettleExpenseOccurrenceUseCase(ports).execute({
      companyId: COMPANY_A,
      occurrenceId: paidId,
      paidAmount: '90.00',
      paidAt: '2026-11-12',
      settledBy: USER_ID,
      settlementNote: null,
    })
    await createCancelExpenseOccurrenceUseCase(ports).execute({
      canceledBy: USER_ID,
      companyId: COMPANY_A,
      occurrenceId: canceledId,
      reason: 'erro',
    })

    const { items, totals } = await createListExpenseOccurrencesUseCase(ports).execute({
      companyId: COMPANY_A,
      filters: { competence: '2026-11' },
    })

    expect(items).toHaveLength(3)
    expect(totals.expectedAmount).toBe('125.15')
    expect(totals.paidAmount).toBe('90.00')
  })

  it('toda escrita grava a trilha com o autor e a entidade (RF9)', async () => {
    const ports = buildInMemoryExpenses()
    const occurrenceId = await seedVariable(ports, '100.00')
    await createSettleExpenseOccurrenceUseCase(ports).execute({
      companyId: COMPANY_A,
      occurrenceId,
      paidAmount: '100.00',
      paidAt: '2026-11-12',
      settledBy: USER_ID,
      settlementNote: null,
    })

    expect(ports.auditRows.map((a) => [a.action, a.actorUserId, a.entityType])).toEqual([
      ['expense.created', USER_ID, 'company_expense'],
      ['expense.occurrence.settled', USER_ID, 'company_expense_occurrence'],
    ])
  })
})
