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

const WORKER_PACKAGE = '../../package.json'
const API_PACKAGE = '../../../api-transportada/package.json'
const SDK_PACKAGE = '@adatechnology/expense-contracts'
const SDK_IMPORT = `from '${SDK_PACKAGE}'`

/** O calendário saiu de cópia por valor: as duas apps reexportam o mesmo pacote, na mesma versão fixa. */
const SCHEDULE_EXPORTS = [
  'EXPENSE_GENERATION_WINDOW_MONTHS',
  'listExpenseCompetenceWindow',
  'resolveExpenseDueDate',
  'resolveExpenseSlots',
]

describe('paridade da rotina das contas fixas com a API (spec 325 T1.5)', () => {
  test('o calendário vem do mesmo pacote do SDK nas duas apps, sem implementação local', async () => {
    const [worker, api] = await Promise.all([read(WORKER_POLICY), read(API_POLICY)])
    for (const source of [worker, api]) {
      expect(source).toContain(SDK_IMPORT)
      for (const name of SCHEDULE_EXPORTS) expect(source).toContain(`  ${name},`)
      expect(source).not.toContain('function resolveExpenseSlots')
      expect(source).not.toContain('function resolveExpenseDueDate')
    }
  })

  test('a versão do pacote é a mesma, fixa, nas duas apps', async () => {
    const [worker, api] = await Promise.all([read(WORKER_PACKAGE), read(API_PACKAGE)])
    const versionOf = (manifest: string): unknown =>
      (JSON.parse(manifest) as { dependencies?: Record<string, string> }).dependencies?.[
        SDK_PACKAGE
      ]
    expect(versionOf(worker)).toMatch(/^\d+\.\d+\.\d+$/)
    expect(versionOf(worker)).toBe(versionOf(api))
  })

  test('o SQL do worker usa a mesma chave de conflito e os mesmos filtros da API', async () => {
    const [worker, api] = await Promise.all([read(WORKER_SQL), read(API_REPOSITORY)])
    expect(worker).toContain('on conflict (expense_id, competence, slot) do nothing')
    // Spec 329: o valor da competência sai da última mudança de valor com início até ela, na API e no worker.
    expect(worker).toContain('from company_expense_amount_changes')
    expect(worker).toContain('effective_competence <= ${input.competence}')
    expect(api).toContain('companyExpenseAmountChanges.effectiveCompetence')
    expect(api).toContain('<= ${input.competence}')
    expect(api).toContain('companyExpenseOccurrences.expenseId')
    expect(api).toContain('companyExpenseOccurrences.competence')
    expect(api).toContain('companyExpenseOccurrences.slot')
    expect(worker).toContain("active = true and kind = 'fixed'")
    expect(api).toContain("eq(companyExpenses.kind, 'fixed')")
    expect(api).toContain('eq(companyExpenses.active, true)')
  })
})
