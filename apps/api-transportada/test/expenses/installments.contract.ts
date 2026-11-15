/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 (extensão "parcelas"): a conta fixa com total de parcelas numera as ocorrências e a rotina para na última.
 */
import { describe, expect, it } from 'bun:test'

import { createCreateExpenseUseCase } from '../../src/expenses/application/expense.use-case.js'
import { createGenerateExpenseOccurrencesUseCase } from '../../src/expenses/application/expense-occurrence.use-case.js'
import { resolveExpenseSlots } from '../../src/expenses/domain/expense-schedule.policy.js'
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
  expectedAmount: '500.00',
  name: 'Parcela do caminhão',
}

describe('parcelas da conta fixa (spec 325)', () => {
  it('numera as ocorrências e para na última parcela, mesmo com a rotina rodando depois', async () => {
    const ports = buildInMemoryExpenses()
    await createCreateExpenseUseCase(ports).execute({
      ...base,
      dueDay: 10,
      installmentsTotal: 3,
      kind: 'fixed',
      recurrence: 'monthly',
      today: '2026-11-13',
    })
    const generate = createGenerateExpenseOccurrencesUseCase(ports)
    await generate.execute({ companyId: COMPANY_A, today: '2026-11-13' })
    await generate.execute({ companyId: COMPANY_A, today: '2027-03-01' })

    expect(ports.occurrenceRows.map((o) => [o.competence, o.installmentNumber])).toEqual([
      ['2026-11', 1],
      ['2026-12', 2],
      ['2027-01', 3],
    ])
  })

  it('conta sem total continua sem fim e sem número de parcela', async () => {
    const ports = buildInMemoryExpenses()
    await createCreateExpenseUseCase(ports).execute({
      ...base,
      dueDay: 10,
      kind: 'fixed',
      recurrence: 'monthly',
      today: '2026-11-13',
    })
    expect(ports.occurrenceRows).toHaveLength(4)
    expect(ports.occurrenceRows.every((o) => (o.installmentNumber ?? null) === null)).toBe(true)
  })

  it('bimestral conta uma parcela por período; quinzenal, duas por mês', () => {
    const bimonthly = [0, 1, 2, 3, 4].map((offset) =>
      resolveExpenseSlots({
        anchorCompetence: '2026-11',
        competence: ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'][offset] ?? '',
        dueDay: 5,
        installmentsTotal: 2,
        recurrence: 'bimonthly',
      }).map((s) => s.installmentNumber),
    )
    expect(bimonthly).toEqual([[1], [], [2], [], []])

    const fortnightly = resolveExpenseSlots({
      anchorCompetence: '2026-11',
      competence: '2026-12',
      dueDay: null,
      installmentsTotal: 3,
      recurrence: 'fortnightly',
    })
    expect(fortnightly.map((s) => [s.slot, s.installmentNumber])).toEqual([[1, 3]])
  })

  it('recusa total fora de 2 a 600 e total em conta variável', async () => {
    const ports = buildInMemoryExpenses()
    const create = createCreateExpenseUseCase(ports)
    for (const installmentsTotal of [1, 601, 2.5]) {
      await expect(
        create.execute({
          ...base,
          dueDay: 10,
          installmentsTotal,
          kind: 'fixed',
          recurrence: 'monthly',
          today: '2026-11-13',
        }),
      ).rejects.toThrow()
    }
    await expect(
      create.execute({
        ...base,
        dueDate: '2026-12-01',
        installmentsTotal: 3,
        kind: 'variable',
        today: '2026-11-13',
      }),
    ).rejects.toThrow()
    expect(ports.expenseRows).toHaveLength(0)
  })
})
