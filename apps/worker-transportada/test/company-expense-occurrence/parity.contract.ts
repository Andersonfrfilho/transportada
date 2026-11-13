/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8')

const WORKER_POLICY = '../../src/company-expense-occurrence/domain/expense-schedule.policy.ts'
const API_POLICY = '../../../api-transportada/src/expenses/domain/expense-schedule.policy.ts'
const WORKER_SQL =
  '../../src/company-expense-occurrence/infrastructure/drizzle-company-expense-occurrence.repository.ts'
const API_REPOSITORY =
  '../../../api-transportada/src/expenses/infrastructure/drizzle-expenses.repository.ts'

/** As linhas que carregam a regra do calendário: se a API mudar uma e a cópia não, a rotina gera mês errado. */
const POLICY_LINES = [
  'export const EXPENSE_GENERATION_WINDOW_MONTHS = 4',
  'const FORTNIGHT_FIRST_DAY = 15',
  'bimonthly: 2,',
  'fortnightly: 1,',
  'monthly: 1,',
  'quarterly: 3,',
  'yearly: 12,',
  'const day = Math.min(params.dueDay, lastDayOfMonth(year, month))',
  'if (distance < 0 || distance % MONTHS_BETWEEN[params.recurrence] !== 0) return []',
  'dueDay: 31 }), slot: 2 }',
]

describe('paridade da rotina das contas fixas com a API (spec 325 T1.5)', () => {
  test('a política de calendário é a mesma, linha a linha', async () => {
    const [worker, api] = await Promise.all([read(WORKER_POLICY), read(API_POLICY)])
    for (const line of POLICY_LINES) {
      expect(api).toContain(line)
      expect(worker).toContain(line)
    }
  })

  test('o SQL do worker usa a mesma chave de conflito e os mesmos filtros da API', async () => {
    const [worker, api] = await Promise.all([read(WORKER_SQL), read(API_REPOSITORY)])
    expect(worker).toContain('on conflict (expense_id, competence, slot) do nothing')
    expect(api).toContain('companyExpenseOccurrences.expenseId')
    expect(api).toContain('companyExpenseOccurrences.competence')
    expect(api).toContain('companyExpenseOccurrences.slot')
    expect(worker).toContain("active = true and kind = 'fixed'")
    expect(api).toContain("eq(companyExpenses.kind, 'fixed')")
    expect(api).toContain('eq(companyExpenses.active, true)')
  })
})
