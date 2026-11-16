/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 RF1 e casos extremos: vencimento é data civil; dia 31 em mês curto cai no último dia.
 */
import { describe, expect, it } from 'bun:test'

import { resolveExpenseDueDate } from '../../src/expenses/domain/expense-schedule.policy.js'

describe('vencimento da conta fixa (spec 325, dia 31)', () => {
  it('dia 31 em fevereiro cai no último dia do mês', () => {
    expect(resolveExpenseDueDate({ competence: '2026-02', dueDay: 31 })).toBe('2026-02-28')
  })

  it('dia 31 em fevereiro de ano bissexto cai em 29', () => {
    expect(resolveExpenseDueDate({ competence: '2028-02', dueDay: 31 })).toBe('2028-02-29')
  })

  it('dia 31 em mês de 30 dias cai em 30', () => {
    expect(resolveExpenseDueDate({ competence: '2026-04', dueDay: 31 })).toBe('2026-04-30')
  })

  it('dia que existe no mês é mantido', () => {
    expect(resolveExpenseDueDate({ competence: '2026-03', dueDay: 5 })).toBe('2026-03-05')
    expect(resolveExpenseDueDate({ competence: '2026-03', dueDay: 31 })).toBe('2026-03-31')
  })

  it('recusa dia fora de 1–31', () => {
    expect(() => resolveExpenseDueDate({ competence: '2026-03', dueDay: 0 })).toThrow(/dueDay/)
    expect(() => resolveExpenseDueDate({ competence: '2026-03', dueDay: 32 })).toThrow(/dueDay/)
  })
})
