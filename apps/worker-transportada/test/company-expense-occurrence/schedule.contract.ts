/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  civilDateInSaoPaulo,
  listExpenseCompetenceWindow,
  resolveExpenseDueDate,
  resolveExpenseSlots,
} from '../../src/company-expense-occurrence/domain/expense-schedule.policy.js'

/** Tabela espelhada com a da API (`test/expenses/due-date.contract.ts`): mesma entrada, mesma saída. */
describe('calendário das contas fixas (spec 325 RF1/RF4)', () => {
  test.each([
    ['2026-02', 31, '2026-02-28'],
    ['2028-02', 31, '2028-02-29'],
    ['2026-04', 31, '2026-04-30'],
    ['2026-11', 5, '2026-11-05'],
  ] as const)('vencimento %s dia %i → %s', (competence, dueDay, expected) => {
    expect(resolveExpenseDueDate({ competence, dueDay })).toBe(expected)
  })

  test('a janela tem quatro competências e vira o ano', () => {
    expect(listExpenseCompetenceWindow('2026-11-13')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ])
  })

  test('trimestral e anual contam a partir da âncora', () => {
    const quarterly = (competence: string) =>
      resolveExpenseSlots({
        anchorCompetence: '2026-11',
        competence,
        dueDay: 10,
        recurrence: 'quarterly',
      })
    expect(quarterly('2026-11')).toHaveLength(1)
    expect(quarterly('2026-12')).toEqual([])
    expect(quarterly('2027-02')).toHaveLength(1)
    expect(
      resolveExpenseSlots({
        anchorCompetence: '2026-11',
        competence: '2027-11',
        dueDay: 10,
        recurrence: 'yearly',
      }),
    ).toHaveLength(1)
  })

  test('mês anterior à âncora não gera', () => {
    expect(
      resolveExpenseSlots({
        anchorCompetence: '2026-11',
        competence: '2026-10',
        dueDay: 10,
        recurrence: 'monthly',
      }),
    ).toEqual([])
  })

  test('data civil de São Paulo (UTC-3)', () => {
    expect(civilDateInSaoPaulo(new Date('2026-12-01T02:30:00.000Z'))).toBe('2026-11-30')
    expect(civilDateInSaoPaulo(new Date('2026-12-01T03:00:00.000Z'))).toBe('2026-12-01')
  })
})
