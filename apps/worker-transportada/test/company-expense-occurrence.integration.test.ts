/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A geração das ocorrências contra Postgres de verdade: nasce uma vez, o segundo ciclo não duplica, conta inativa e
 * variável não geram, e a âncora segue o mês de criação da conta.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createCompanyExpenseOccurrenceRoutine } from '../src/company-expense-occurrence/application/company-expense-occurrence.routine.js'
import { COMPANY_EXPENSE_OCCURRENCE_GENERATE_JOB } from '../src/company-expense-occurrence/domain/company-expense-occurrence.constant.js'
import { createDrizzleCompanyExpenseOccurrencePorts } from '../src/company-expense-occurrence/infrastructure/drizzle-company-expense-occurrence.repository.js'
import type { JobRoutineContext } from '../src/job-run/application/job-routine.port.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const NOOP = () => undefined
const SILENT_LOGGER = { debug: NOOP, error: NOOP, info: NOOP, warn: NOOP }
const NOW = new Date('2026-11-13T15:00:00.000Z')

const CONTEXT: JobRoutineContext = {
  correlationId: 'company-expense-occurrence-integration',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: COMPANY_EXPENSE_OCCURRENCE_GENERATE_JOB,
  origin: 'schedule',
}

describeDatabase('geração das ocorrências das contas fixas (integration)', () => {
  const companyId = crypto.randomUUID()
  const categoryId = crypto.randomUUID()
  const monthlyId = crypto.randomUUID()
  const fortnightlyId = crypto.randomUUID()
  const inactiveId = crypto.randomUUID()
  const variableId = crypto.randomUUID()
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db

  async function insertExpense(input: {
    readonly active: boolean
    readonly dueDay: number | null
    readonly id: string
    readonly kind: 'fixed' | 'variable'
    readonly recurrence: string | null
  }) {
    await db.execute(sql`
      insert into company_expenses
        (id, company_id, name, kind, category_id, expected_amount, active, recurrence, due_day, created_at)
      values (
        ${input.id}::uuid, ${companyId}::uuid, ${`conta ${input.id}`}, ${input.kind}, ${categoryId}::uuid,
        1500.50, ${input.active}, ${input.recurrence}, ${input.dueDay}::smallint, '2026-11-02T12:00:00Z'
      )
    `)
  }

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(
      sql`insert into company_expense_categories (id, company_id, name) values (${categoryId}::uuid, ${companyId}::uuid, 'Aluguel')`,
    )
    await insertExpense({
      active: true,
      dueDay: 31,
      id: monthlyId,
      kind: 'fixed',
      recurrence: 'monthly',
    })
    await insertExpense({
      active: true,
      dueDay: null,
      id: fortnightlyId,
      kind: 'fixed',
      recurrence: 'fortnightly',
    })
    await insertExpense({
      active: false,
      dueDay: 5,
      id: inactiveId,
      kind: 'fixed',
      recurrence: 'monthly',
    })
    await insertExpense({
      active: true,
      dueDay: null,
      id: variableId,
      kind: 'variable',
      recurrence: null,
    })
  })

  afterAll(async () => {
    await db.execute(
      sql`delete from company_expense_occurrences where company_id = ${companyId}::uuid`,
    )
    await db.execute(sql`delete from company_expenses where company_id = ${companyId}::uuid`)
    await db.execute(
      sql`delete from company_expense_categories where company_id = ${companyId}::uuid`,
    )
    await db.execute(sql`delete from companies where id = ${companyId}::uuid`)
    await provider.close()
  })

  function buildRoutine() {
    return createCompanyExpenseOccurrenceRoutine({
      logger: SILENT_LOGGER as never,
      now: () => NOW,
      ports: createDrizzleCompanyExpenseOccurrencePorts(db),
    })
  }

  async function occurrences() {
    return db.execute(sql`
      select expense_id, competence, slot, due_date::text as due_date, expected_amount::text as expected_amount, status
      from company_expense_occurrences where company_id = ${companyId}::uuid
      order by expense_id, competence, slot
    `)
  }

  test('gera a janela das fixas ativas, e só delas', async () => {
    const result = await buildRoutine().run(CONTEXT)
    expect(result.outcome).toBe('succeeded')

    const rows = await occurrences()
    const byExpense = (id: string) => rows.filter((row) => row.expense_id === id)
    expect(byExpense(monthlyId).map((row) => row.due_date)).toEqual([
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
    ])
    expect(byExpense(monthlyId)[0]).toMatchObject({
      expected_amount: '1500.50',
      slot: 1,
      status: 'open',
    })
    expect(byExpense(fortnightlyId)).toHaveLength(8)
    expect(byExpense(inactiveId)).toHaveLength(0)
    expect(byExpense(variableId)).toHaveLength(0)
  })

  test('o segundo ciclo, e a conta cadastrada de novo no meio, não duplicam nada', async () => {
    const before = (await occurrences()).length
    const again = await buildRoutine().run(CONTEXT)
    expect(again.counters.created).toBe(0)
    expect((await occurrences()).length).toBe(before)
  })
})
