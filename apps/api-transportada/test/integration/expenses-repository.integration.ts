/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.4: as portas Drizzle do módulo Contas contra um Postgres de verdade. O que só o banco prova: a
 * semente de empresa nova, `unique(expense, competence, slot)` com `ON CONFLICT DO NOTHING`, a baixa/cancelamento
 * por `UPDATE … WHERE status = 'open'` e o isolamento por empresa.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  createGenerateExpenseOccurrencesUseCase,
  createSettleExpenseOccurrenceUseCase,
} from '../../src/expenses/application/expense-occurrence.use-case.js'
import {
  createCreateExpenseUseCase,
  createListExpenseCategoriesUseCase,
} from '../../src/expenses/application/expense.use-case.js'
import { ExpenseOccurrenceNotFoundError } from '../../src/expenses/domain/expense.error.js'
import { createDrizzleExpensesPorts } from '../../src/expenses/infrastructure/drizzle-expenses.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const describeDatabase = databaseUrl === undefined ? describe.skip : describe

type TestDatabase = ReturnType<typeof createDrizzleProvider>

describeDatabase('contas da empresa no banco (spec 325 T1.4)', () => {
  const companyA = crypto.randomUUID()
  const companyB = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const databaseName = `transportada_325_${crypto.randomUUID().replaceAll('-', '')}`
  let admin: SQL | undefined
  let database: TestDatabase | undefined

  function ports() {
    if (database === undefined) throw new Error('A disposable database is required')
    return createDrizzleExpensesPorts(database.db)
  }

  async function categoryId(companyId: string, name: string): Promise<string> {
    const list = await createListExpenseCategoriesUseCase(ports()).execute({ companyId })
    const found = list.find((category) => category.name === name)
    if (found === undefined) throw new Error(`category ${name}`)
    return found.id
  }

  beforeAll(async () => {
    if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
    admin = new SQL(databaseUrl, { max: 1 })
    const disposableUrl = new URL(databaseUrl)
    disposableUrl.pathname = `/${databaseName}`
    disposableUrl.search = ''
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })

    await database.db.execute(
      sql`insert into identity_users (id, status) values (${userId}, 'active')`,
    )
    for (const companyId of [companyA, companyB]) {
      await database.db.execute(
        sql`insert into companies (id, status) values (${companyId}, 'active')`,
      )
      await database.db.execute(sql`
        insert into user_company_memberships (id, user_id, company_id, status)
        values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')
      `)
    }
    await database.db.execute(sql`
      insert into fleet_drivers (id, company_id, name, tax_id)
      values (${driverId}, ${companyA}, 'Agregado Um', '12345678901')
    `)
  }, 60_000)

  afterAll(async () => {
    try {
      await database?.close()
    } finally {
      try {
        await admin?.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin?.close({ timeout: 0 })
      }
    }
  }, 60_000)

  test('empresa nova recebe as 8 categorias no primeiro uso, uma vez só', async () => {
    const first = await createListExpenseCategoriesUseCase(ports()).execute({ companyId: companyA })
    const second = await createListExpenseCategoriesUseCase(ports()).execute({
      companyId: companyA,
    })

    expect(first.map((c) => c.name)).toEqual([
      'Aluguel',
      'Folha',
      'Impostos',
      'Seguro',
      'Manutenção',
      'Combustível',
      'Pagamento de motorista/agregado',
      'Outros',
    ])
    expect(second).toHaveLength(8)
    expect(first.filter((c) => c.requiresDriver).map((c) => c.name)).toEqual([
      'Pagamento de motorista/agregado',
    ])
  })

  test('quinzenal grava os dois slots, e rodar a geração de novo não duplica', async () => {
    const created = await createCreateExpenseUseCase(ports()).execute({
      categoryId: await categoryId(companyA, 'Pagamento de motorista/agregado'),
      companyId: companyA,
      createdBy: userId,
      expectedAmount: '2000.00',
      kind: 'fixed',
      name: 'Quinzena do agregado',
      payeeDriverId: driverId,
      recurrence: 'fortnightly',
      today: '2026-11-13',
    })
    await createGenerateExpenseOccurrencesUseCase(ports()).execute({
      companyId: companyA,
      today: '2026-11-13',
    })

    const rows = await ports().occurrences.list({
      companyId: companyA,
      filters: { competence: '2026-11' },
    })
    expect(
      rows.map((r) => [r.slot, r.dueDate, r.payeeDriverName, r.payeeDriverPaymentModel]),
    ).toEqual([
      [1, '2026-11-15', 'Agregado Um', 'route_table'],
      [2, '2026-11-30', 'Agregado Um', 'route_table'],
    ])
    const all = await ports().occurrences.list({ companyId: companyA, filters: {} })
    expect(all).toHaveLength(8)
    expect(created.anchorCompetence).toBe('2026-11')
  })

  test('baixa grava uma vez, a segunda é recusada e a outra empresa não enxerga', async () => {
    const [target] = await ports().occurrences.list({ companyId: companyA, filters: {} })
    if (target === undefined) throw new Error('seed')
    const settle = createSettleExpenseOccurrenceUseCase(ports())
    const input = {
      companyId: companyA,
      occurrenceId: target.id,
      paidAmount: '1990.50',
      paidAt: '2026-11-15',
      settledBy: userId,
      settlementNote: null,
    }

    const paid = await settle.execute(input)
    const again = settle.execute({ ...input, paidAmount: '1.00' })
    const otherCompany = settle.execute({ ...input, companyId: companyB })

    expect(paid).toMatchObject({ paidAmount: '1990.50', paidAt: '2026-11-15', status: 'paid' })
    await expect(again).rejects.toMatchObject({ code: 'EXPENSE_OCCURRENCE_ALREADY_PAID' })
    await expect(otherCompany).rejects.toBeInstanceOf(ExpenseOccurrenceNotFoundError)
    const rows = await ports().occurrences.list({ companyId: companyB, filters: {} })
    expect(rows).toEqual([])
  })

  test('a trilha de auditoria grava a permissão expenses.manage', async () => {
    const rows = await database!.db.execute<{ action: string; permission: string }>(sql`
      select action, permission from audit_logs where company_id = ${companyA} order by created_at
    `)

    expect(rows.map((r) => r.action)).toEqual(['expense.created', 'expense.occurrence.settled'])
    expect(rows.every((r) => r.permission === 'expenses.manage')).toBe(true)
  })
})
