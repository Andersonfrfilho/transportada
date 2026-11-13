/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 RF4, RF5, CA01: geração idempotente de 4 competências (mês corrente + 3), nunca para
 * conta inativa, e a conta variável tem uma ocorrência só.
 */
import { describe, expect, it } from 'bun:test'

import { createCreateExpenseUseCase } from '../../src/expenses/application/expense.use-case.js'
import { createGenerateExpenseOccurrencesUseCase } from '../../src/expenses/application/expense-occurrence.use-case.js'
import {
  buildInMemoryExpenses,
  CATEGORY_RENT_ID,
  COMPANY_A,
  USER_ID,
} from '../fixtures/expenses-in-memory.fixture.js'

const base = {
  categoryId: CATEGORY_RENT_ID,
  companyId: COMPANY_A,
  createdBy: USER_ID,
  expectedAmount: '1500.00',
  today: '2026-11-13',
}

describe('ocorrências da conta (spec 325 CA01)', () => {
  it('cadastrar a fixa gera o mês corrente e os 3 seguintes', async () => {
    const ports = buildInMemoryExpenses()
    await createCreateExpenseUseCase(ports).execute({
      ...base,
      dueDay: 31,
      kind: 'fixed',
      name: 'Aluguel',
      recurrence: 'monthly',
    })

    expect(ports.occurrenceRows.map((o) => [o.competence, o.dueDate])).toEqual([
      ['2026-11', '2026-11-30'],
      ['2026-12', '2026-12-31'],
      ['2027-01', '2027-01-31'],
      ['2027-02', '2027-02-28'],
    ])
  })

  it('a rotina rodando duas vezes não duplica nenhuma ocorrência', async () => {
    const ports = buildInMemoryExpenses()
    await createCreateExpenseUseCase(ports).execute({
      ...base,
      dueDay: 5,
      kind: 'fixed',
      name: 'Aluguel',
      recurrence: 'monthly',
    })
    const generate = createGenerateExpenseOccurrencesUseCase(ports)

    await generate.execute({ companyId: COMPANY_A, today: '2026-11-13' })
    await generate.execute({ companyId: COMPANY_A, today: '2026-11-13' })

    expect(ports.occurrenceRows).toHaveLength(4)
  })

  it('não gera para conta inativa', async () => {
    const ports = buildInMemoryExpenses()
    const expense = await ports.expenses.create({
      categoryId: CATEGORY_RENT_ID,
      companyId: COMPANY_A,
      dueDay: 5,
      expectedAmount: '100.00',
      kind: 'fixed',
      name: 'Antiga',
      payeeDriverId: null,
      recurrence: 'monthly',
    })
    Object.assign(expense, { active: false })

    await createGenerateExpenseOccurrencesUseCase(ports).execute({
      companyId: COMPANY_A,
      today: '2026-11-13',
    })

    expect(ports.occurrenceRows).toHaveLength(0)
  })

  it('conta variável tem exatamente uma ocorrência, com o vencimento informado', async () => {
    const ports = buildInMemoryExpenses()
    await createCreateExpenseUseCase(ports).execute({
      ...base,
      dueDate: '2026-11-20',
      kind: 'variable',
      name: 'Troca de pneus',
    })

    expect(ports.occurrenceRows.map((o) => o.dueDate)).toEqual(['2026-11-20'])
  })
})
