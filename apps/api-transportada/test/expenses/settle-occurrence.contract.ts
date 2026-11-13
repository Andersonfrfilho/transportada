/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 P3, RF5, casos extremos, CA04: a baixa é única e imutável; erros com código estável.
 */
import { beforeEach, describe, expect, it } from 'bun:test'

import { createSettleExpenseOccurrenceUseCase } from '../../src/expenses/application/expense-occurrence.use-case.js'
import {
  ExpenseInvalidPaidAmountError,
  ExpenseOccurrenceAlreadyPaidError,
  ExpenseOccurrenceCanceledError,
  ExpenseOccurrenceNotFoundError,
} from '../../src/expenses/domain/expense.error.js'
import {
  buildInMemoryExpenses,
  CATEGORY_RENT_ID,
  COMPANY_A,
  COMPANY_B,
  type InMemoryExpenses,
  USER_ID,
} from '../fixtures/expenses-in-memory.fixture.js'

let ports: InMemoryExpenses
let occurrenceId: string

async function seedOccurrence(status: 'canceled' | 'open'): Promise<string> {
  const expense = await ports.expenses.create({
    categoryId: CATEGORY_RENT_ID,
    companyId: COMPANY_A,
    dueDay: 5,
    expectedAmount: '1500.00',
    kind: 'fixed',
    name: 'Aluguel',
    payeeDriverId: null,
    recurrence: 'monthly',
  })
  await ports.occurrences.insertIfAbsent({
    companyId: COMPANY_A,
    competence: '2026-11',
    dueDate: '2026-11-05',
    expectedAmount: '1500.00',
    expenseId: expense.id,
  })
  const row = ports.occurrenceRows[0]
  if (row === undefined) throw new Error('seed')
  if (status === 'canceled') Object.assign(row, { status: 'canceled' })
  return row.id
}

const settleInput = {
  paidAmount: '1480.00',
  paidAt: '2026-11-04',
  settlementNote: 'desconto à vista',
  settledBy: USER_ID,
}

beforeEach(async () => {
  ports = buildInMemoryExpenses()
  occurrenceId = await seedOccurrence('open')
})

describe('dar baixa na ocorrência (spec 325 P3)', () => {
  it('baixa a ocorrência em aberto com valor, data, observação e autor', async () => {
    const useCase = createSettleExpenseOccurrenceUseCase(ports)

    const result = await useCase.execute({ ...settleInput, companyId: COMPANY_A, occurrenceId })

    expect(result.status).toBe('paid')
    expect(result.paidAmount).toBe('1480.00')
    expect(result.paidBy).toBe(USER_ID)
    expect(result.expectedAmount).toBe('1500.00')
  })

  /** Baixa idempotente: a segunda é 409 e não reescreve a primeira. */
  it('baixa duas vezes → ExpenseOccurrenceAlreadyPaidError (409) e o primeiro pagamento fica', async () => {
    const useCase = createSettleExpenseOccurrenceUseCase(ports)
    await useCase.execute({ ...settleInput, companyId: COMPANY_A, occurrenceId })

    const second = useCase.execute({
      ...settleInput,
      companyId: COMPANY_A,
      occurrenceId,
      paidAmount: '9999.00',
    })

    await expect(second).rejects.toBeInstanceOf(ExpenseOccurrenceAlreadyPaidError)
    expect(ports.occurrenceRows[0]?.paidAmount).toBe('1480.00')
  })

  it('valor pago zero ou negativo → ExpenseInvalidPaidAmountError (400)', async () => {
    const useCase = createSettleExpenseOccurrenceUseCase(ports)

    for (const paidAmount of ['0', '0.00', '-10.00']) {
      const attempt = useCase.execute({
        ...settleInput,
        companyId: COMPANY_A,
        occurrenceId,
        paidAmount,
      })
      await expect(attempt).rejects.toBeInstanceOf(ExpenseInvalidPaidAmountError)
    }
    expect(ports.occurrenceRows[0]?.status).toBe('open')
  })

  it('ocorrência cancelada → ExpenseOccurrenceCanceledError (409)', async () => {
    const canceledId = await (async () => {
      ports = buildInMemoryExpenses()
      return seedOccurrence('canceled')
    })()
    const useCase = createSettleExpenseOccurrenceUseCase(ports)

    const attempt = useCase.execute({
      ...settleInput,
      companyId: COMPANY_A,
      occurrenceId: canceledId,
    })

    await expect(attempt).rejects.toBeInstanceOf(ExpenseOccurrenceCanceledError)
  })

  /** CA04: usuário de outra empresa não descobre que a ocorrência existe. */
  it('ocorrência de outra empresa → ExpenseOccurrenceNotFoundError (404) e nada muda', async () => {
    const useCase = createSettleExpenseOccurrenceUseCase(ports)

    const attempt = useCase.execute({ ...settleInput, companyId: COMPANY_B, occurrenceId })

    await expect(attempt).rejects.toBeInstanceOf(ExpenseOccurrenceNotFoundError)
    expect(ports.occurrenceRows[0]?.status).toBe('open')
  })
})
