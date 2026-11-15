/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 328: "quem causou a conta" — campo opcional e só informativo (a multa do motorista, o dano do ajudante).
 * Qualquer ficha da frota da empresa, inclusive ajudante; não é quem recebe os avisos.
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
  HELPER_A_ID,
  OFFICE_USER_A_ID,
  USER_ID,
} from '../fixtures/expenses-in-memory.fixture.js'

const base = {
  categoryId: CATEGORY_RENT_ID,
  companyId: COMPANY_A,
  createdBy: USER_ID,
  dueDate: '2026-11-20',
  expectedAmount: '300.00',
  kind: 'variable' as const,
  name: 'Multa de trânsito',
  today: '2026-11-13',
}

describe('quem causou a conta (spec 328)', () => {
  it('grava a pessoa, motorista ou ajudante, e a audita', async () => {
    for (const personId of [DRIVER_A_ID, HELPER_A_ID]) {
      const ports = buildInMemoryExpenses()
      const expense = await createCreateExpenseUseCase(ports).execute({
        ...base,
        causedByDriverId: personId,
      })
      expect(expense.causedByDriverId).toBe(personId)
      expect(ports.auditRows.at(-1)?.metadata.causedByDriverId).toBe(personId)
    }
  })

  it('sem o campo a conta nasce sem causador, como sempre', async () => {
    const ports = buildInMemoryExpenses()
    const expense = await createCreateExpenseUseCase(ports).execute(base)
    expect(expense.causedByDriverId ?? null).toBeNull()
  })

  it('recusa ficha de outra empresa ou inexistente', async () => {
    const ports = buildInMemoryExpenses()
    for (const personId of [DRIVER_B_ID, crypto.randomUUID()]) {
      await expect(
        createCreateExpenseUseCase(ports).execute({ ...base, causedByDriverId: personId }),
      ).rejects.toBeInstanceOf(ExpenseDriverNotFoundError)
    }
    expect(ports.expenseRows).toHaveLength(0)
  })

  it('a edição troca e limpa o causador; ausente não mexe', async () => {
    const ports = buildInMemoryExpenses()
    const created = await createCreateExpenseUseCase(ports).execute(base)
    const update = createUpdateExpenseUseCase(ports)

    const set = await update.execute({
      companyId: COMPANY_A,
      causedByDriverId: HELPER_A_ID,
      expenseId: created.id,
      updatedBy: USER_ID,
    })
    expect(set.causedByDriverId).toBe(HELPER_A_ID)

    const untouched = await update.execute({
      companyId: COMPANY_A,
      expenseId: created.id,
      name: 'Multa de trânsito (renomeada)',
      updatedBy: USER_ID,
    })
    expect(untouched.causedByDriverId).toBe(HELPER_A_ID)

    const cleared = await update.execute({
      companyId: COMPANY_A,
      causedByDriverId: null,
      expenseId: created.id,
      updatedBy: USER_ID,
    })
    expect(cleared.causedByDriverId).toBeNull()

    await expect(
      update.execute({
        companyId: COMPANY_A,
        causedByDriverId: DRIVER_B_ID,
        expenseId: created.id,
        updatedBy: USER_ID,
      }),
    ).rejects.toBeInstanceOf(ExpenseDriverNotFoundError)
  })

  it('a lista de ocorrências devolve o causador e filtra por ele', async () => {
    const ports = buildInMemoryExpenses()
    const create = createCreateExpenseUseCase(ports)
    await create.execute({ ...base, causedByDriverId: DRIVER_A_ID, name: 'Multa A' })
    await create.execute({ ...base, causedByDriverId: HELPER_A_ID, name: 'Dano B' })
    await create.execute({ ...base, name: 'Sem causador' })

    const all = await ports.occurrences.list({ companyId: COMPANY_A, filters: {} })
    expect(all).toHaveLength(3)

    const only = await ports.occurrences.list({
      companyId: COMPANY_A,
      filters: { causedByDriverId: HELPER_A_ID },
    })
    expect(only.map((item) => item.expenseName)).toEqual(['Dano B'])
    expect(only[0]?.causedByDriverId).toBe(HELPER_A_ID)
    expect(only[0]?.causedByDriverName).not.toBeNull()
    expect(all.find((item) => item.expenseName === 'Sem causador')?.causedByDriverName).toBeNull()
  })
})

describe('causador usuário ou nome digitado, e onde a conta está (spec 328)', () => {
  it('usuário do escritório, nome digitado e onde está entram e são auditados', async () => {
    const ports = buildInMemoryExpenses()
    const byUser = await createCreateExpenseUseCase(ports).execute({
      ...base,
      billLocation: '  Com a Andréia ',
      causedByUserId: OFFICE_USER_A_ID,
    })
    expect(byUser.causedByUserId).toBe(OFFICE_USER_A_ID)
    expect(byUser.billLocation).toBe('Com a Andréia')
    expect(ports.auditRows.at(-1)?.metadata.causedByUserId).toBe(OFFICE_USER_A_ID)
    const byName = await createCreateExpenseUseCase(ports).execute({
      ...base,
      causedByName: ' Seu Zé do posto ',
    })
    expect(byName.causedByName).toBe('Seu Zé do posto')
    expect(byName.billLocation).toBeNull()
  })

  it('só um causador por conta, e usuário de fora da empresa é recusado', async () => {
    const ports = buildInMemoryExpenses()
    await expect(
      createCreateExpenseUseCase(ports).execute({
        ...base,
        causedByDriverId: DRIVER_A_ID,
        causedByName: 'Fulano',
      }),
    ).rejects.toBeInstanceOf(ExpenseInvalidScheduleError)
    await expect(
      createCreateExpenseUseCase(ports).execute({ ...base, causedByUserId: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(ExpenseDriverNotFoundError)
  })

  it('trocar o causador limpa os outros; limpar o lugar com null', async () => {
    const ports = buildInMemoryExpenses()
    const created = await createCreateExpenseUseCase(ports).execute({
      ...base,
      billLocation: 'Fatura do cartão',
      causedByDriverId: DRIVER_A_ID,
    })
    const update = createUpdateExpenseUseCase(ports)
    const toName = await update.execute({
      companyId: COMPANY_A,
      expenseId: created.id,
      causedByName: 'Seu Zé',
      updatedBy: USER_ID,
    } as never)
    expect(toName.causedByName).toBe('Seu Zé')
    expect(toName.causedByDriverId).toBeNull()
    const cleared = await update.execute({
      billLocation: null,
      companyId: COMPANY_A,
      expenseId: created.id,
      updatedBy: USER_ID,
    } as never)
    expect(cleared.billLocation).toBeNull()
    expect(cleared.causedByName).toBe('Seu Zé')
  })
})
