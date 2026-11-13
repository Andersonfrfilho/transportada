/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ActiveFixedExpense,
  CompanyExpenseOccurrencePorts,
  ExpenseOccurrenceToInsert,
} from '../../src/company-expense-occurrence/application/company-expense-occurrence.port.js'
import { createCompanyExpenseOccurrenceRoutine } from '../../src/company-expense-occurrence/application/company-expense-occurrence.routine.js'
import { COMPANY_EXPENSE_OCCURRENCE_GENERATE_JOB } from '../../src/company-expense-occurrence/domain/company-expense-occurrence.constant.js'
import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'

/** 02:30 UTC de 1º/dez já é 30/nov em São Paulo (UTC-3): a competência corrente do ciclo é novembro. */
const NOW = new Date('2026-12-01T02:30:00.000Z')

function buildContext(isStopRequested: () => boolean = () => false): JobRoutineContext {
  return {
    correlationId: 'company-expense-occurrence-contract',
    executionId: 'execution-1',
    isStopRequested,
    job: COMPANY_EXPENSE_OCCURRENCE_GENERATE_JOB,
    origin: 'schedule',
  }
}

const NOOP = () => undefined
const LOGGER = { debug: NOOP, error: NOOP, info: NOOP, warn: NOOP }

function expense(overrides: Partial<ActiveFixedExpense> & { id: string }): ActiveFixedExpense {
  return {
    anchorCompetence: '2026-11',
    companyId: 'company-a',
    dueDay: 5,
    expectedAmount: '1500.00',
    recurrence: 'monthly',
    ...overrides,
  }
}

function buildPorts(expenses: readonly ActiveFixedExpense[], failCompanyId?: string) {
  const seen = new Set<string>()
  const inserted: ExpenseOccurrenceToInsert[] = []
  const ports: CompanyExpenseOccurrencePorts = {
    insertIfAbsent: async (input) => {
      const key = `${input.expenseId}|${input.competence}|${input.slot}`
      if (seen.has(key)) return false
      seen.add(key)
      inserted.push(input)
      return true
    },
    listActiveFixed: async ({ companyId }) => {
      if (companyId === failCompanyId) throw new Error('boom')
      return expenses.filter((item) => item.companyId === companyId)
    },
    listCompaniesWithActiveFixed: async () => [...new Set(expenses.map((item) => item.companyId))],
  }
  return { inserted, ports }
}

function buildRoutine(ports: CompanyExpenseOccurrencePorts) {
  return createCompanyExpenseOccurrenceRoutine({ logger: LOGGER as never, now: () => NOW, ports })
}

describe('geração das ocorrências das contas fixas (spec 325 T1.5)', () => {
  test('a rotina tem o nome que o catálogo e o CHECK do banco conhecem', () => {
    expect(COMPANY_EXPENSE_OCCURRENCE_GENERATE_JOB).toBe('company-expense.occurrence.generate')
  })

  test('usa a data civil de São Paulo: a janela começa em novembro, não em dezembro', async () => {
    const { inserted, ports } = buildPorts([expense({ id: 'e1' })])
    const result = await buildRoutine(ports).run(buildContext())
    expect(result.outcome).toBe('succeeded')
    expect(inserted.map((row) => row.competence)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ])
    expect(inserted.map((row) => row.dueDate)).toEqual([
      '2026-11-05',
      '2026-12-05',
      '2027-01-05',
      '2027-02-05',
    ])
    expect(result.counters).toEqual({ companies: 1, created: 4 })
  })

  test('é idempotente: o segundo ciclo não cria nada', async () => {
    const { inserted, ports } = buildPorts([expense({ id: 'e1' })])
    await buildRoutine(ports).run(buildContext())
    const second = await buildRoutine(ports).run(buildContext())
    expect(second.counters).toEqual({ companies: 1, created: 0 })
    expect(inserted).toHaveLength(4)
  })

  test('dia 31 cai no último dia do mês curto e a quinzenal gera os dois slots', async () => {
    const { inserted, ports } = buildPorts([
      expense({ dueDay: 31, id: 'dia31' }),
      expense({ dueDay: null, id: 'quinzenal', recurrence: 'fortnightly' }),
    ])
    await buildRoutine(ports).run(buildContext())
    const day31 = inserted.filter((row) => row.expenseId === 'dia31').map((row) => row.dueDate)
    expect(day31).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28'])
    const fortnight = inserted.filter((row) => row.expenseId === 'quinzenal')
    expect(fortnight).toHaveLength(8)
    expect(fortnight.slice(0, 2).map((row) => [row.dueDate, row.slot])).toEqual([
      ['2026-11-15', 1],
      ['2026-11-30', 2],
    ])
  })

  test('a âncora fixa a recorrência longa: bimestral não muda de meses quando a janela anda', async () => {
    const { inserted, ports } = buildPorts([
      expense({ anchorCompetence: '2026-10', id: 'bi', recurrence: 'bimonthly' }),
    ])
    await buildRoutine(ports).run(buildContext())
    // Âncora em outubro: novembro não é da conta; dezembro e fevereiro são.
    expect(inserted.map((row) => row.competence)).toEqual(['2026-12', '2027-02'])
  })

  test('uma empresa que falha não segura as outras, e o ciclo acusa o erro no fim', async () => {
    const { inserted, ports } = buildPorts(
      [expense({ id: 'a1' }), expense({ companyId: 'company-b', id: 'b1' })],
      'company-a',
    )
    await expect(buildRoutine(ports).run(buildContext())).rejects.toThrow(/1 company/)
    expect(inserted.every((row) => row.companyId === 'company-b')).toBe(true)
    expect(inserted.length).toBeGreaterThan(0)
  })

  test('parada pedida: não começa a empresa seguinte', async () => {
    const { inserted, ports } = buildPorts([
      expense({ id: 'a1' }),
      expense({ companyId: 'company-b', id: 'b1' }),
    ])
    let calls = 0
    const result = await buildRoutine(ports).run(buildContext(() => calls++ >= 1))
    expect(result.outcome).toBe('succeeded')
    expect(new Set(inserted.map((row) => row.companyId))).toEqual(new Set(['company-a']))
  })
})
