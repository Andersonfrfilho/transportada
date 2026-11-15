/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 330: modalidade funcionário — a conta de salário aponta a pessoa (ficha da frota, usuário do escritório ou nome
 * digitado), o tipo (CLT, diarista, autônomo, outro) e pode ser quinzenal (dias 15 e último).
 */
import { describe, expect, it } from 'bun:test'

import {
  createCreateExpenseUseCase,
  createUpdateExpenseUseCase,
} from '../../src/expenses/application/expense.use-case.js'
import {
  ExpenseDriverNotFoundError,
  ExpenseInvalidScheduleError,
} from '../../src/expenses/domain/expense.error.js'
import {
  buildInMemoryExpenses,
  CATEGORY_RENT_ID,
  COMPANY_A,
  DRIVER_A_ID,
  DRIVER_B_ID,
  OFFICE_USER_A_ID,
  USER_ID,
} from '../fixtures/expenses-in-memory.fixture.js'

const base = {
  categoryId: CATEGORY_RENT_ID,
  companyId: COMPANY_A,
  createdBy: USER_ID,
  dueDay: 5,
  expectedAmount: '2500.00',
  kind: 'fixed' as const,
  name: 'Salário',
  recurrence: 'monthly' as const,
  today: '2026-11-13',
}

describe('modalidade funcionário (spec 330)', () => {
  it('grava a ficha da frota, o usuário do escritório ou o nome digitado, com o tipo, e audita', async () => {
    const cases = [
      { employeeDriverId: DRIVER_A_ID },
      { employeeUserId: OFFICE_USER_A_ID },
      { employeeName: '  Maria da Limpeza ' },
    ]
    for (const person of cases) {
      const ports = buildInMemoryExpenses()
      const expense = await createCreateExpenseUseCase(ports).execute({
        ...base,
        ...person,
        employmentType: 'clt',
      })
      expect(expense.employmentType).toBe('clt')
      expect(ports.auditRows.at(-1)?.metadata.employmentType).toBe('clt')
    }
    const ports = buildInMemoryExpenses()
    const named = await createCreateExpenseUseCase(ports).execute({
      ...base,
      employeeName: '  Maria da Limpeza ',
      employmentType: 'daily',
    })
    expect(named.employeeName).toBe('Maria da Limpeza')
  })

  it('pode ser quinzenal: vence nos dias 15 e último', async () => {
    const ports = buildInMemoryExpenses()
    const { dueDay: _dueDay, ...withoutDay } = base
    const expense = await createCreateExpenseUseCase(ports).execute({
      ...withoutDay,
      employeeDriverId: DRIVER_A_ID,
      employmentType: 'autonomous',
      recurrence: 'fortnightly',
    })
    expect(expense.recurrence).toBe('fortnightly')
    expect(
      ports.occurrenceRows.filter((row) => row.expenseId === expense.id).length,
    ).toBeGreaterThanOrEqual(2)
  })

  it('recusa ficha de outra empresa, inexistente, mais de uma pessoa e tipo inválido', async () => {
    const ports = buildInMemoryExpenses()
    const create = createCreateExpenseUseCase(ports)
    for (const employeeDriverId of [DRIVER_B_ID, crypto.randomUUID()]) {
      expect(create.execute({ ...base, employeeDriverId })).rejects.toBeInstanceOf(
        ExpenseDriverNotFoundError,
      )
    }
    expect(
      create.execute({ ...base, employeeDriverId: DRIVER_A_ID, employeeName: 'Ana' }),
    ).rejects.toBeInstanceOf(ExpenseInvalidScheduleError)
    expect(
      create.execute({ ...base, employeeName: 'Ana', employmentType: 'estagio' as never }),
    ).rejects.toBeInstanceOf(ExpenseInvalidScheduleError)
  })

  it('na edição troca a pessoa e o tipo; informar um lado limpa o outro', async () => {
    const ports = buildInMemoryExpenses()
    const created = await createCreateExpenseUseCase(ports).execute({
      ...base,
      employeeDriverId: DRIVER_A_ID,
      employmentType: 'clt',
    })
    const updated = await createUpdateExpenseUseCase(ports).execute({
      companyId: COMPANY_A,
      employeeName: 'Carlos',
      employmentType: 'other',
      expenseId: created.id,
      updatedBy: USER_ID,
    })
    expect(updated.employeeName).toBe('Carlos')
    expect(updated.employeeDriverId).toBeNull()
    expect(updated.employmentType).toBe('other')
  })
})
