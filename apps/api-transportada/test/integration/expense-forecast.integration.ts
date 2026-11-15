/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.3: a previsão e o limite do fora do padrão contra um Postgres de verdade. O que só o banco prova: a coluna
 * nova entra com o padrão de 10 nas linhas existentes, a troca grava o limite em todos os grupos rateáveis sem tocar
 * outra empresa, a linha criada depois pela configuração do rateio herda o limite, a troca é auditada, o CHECK recusa
 * valor fora de 0 a 1000, e o caso de uso roda inteiro sobre o SQL real.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  createGetExpenseForecastUseCase,
  createUpdateOutOfPatternSettingsUseCase,
} from '../../src/expenses/application/expense-forecast.use-case.js'
import { createUpdateExpenseAllocationSettingsUseCase } from '../../src/expenses/application/expense-result.use-case.js'
import { createDrizzleExpenseForecastPorts } from '../../src/expenses/infrastructure/drizzle-expense-forecast.repository.js'
import { createDrizzleExpenseResultPorts } from '../../src/expenses/infrastructure/drizzle-expense-result.repository.js'
import { DrizzleApplicableFreightRuleQuery } from '../../src/freight/infrastructure/drizzle-freight.repository.js'
import { DrizzleTripValuationQuery } from '../../src/trips/infrastructure/trip-valuation.query.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const describeDatabase = databaseUrl === undefined ? describe.skip : describe

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const silentLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
} as never

describeDatabase('previsão e limite do fora do padrão no banco (spec 325 T6.3)', () => {
  const companyA = crypto.randomUUID()
  const companyB = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const databaseName = `transportada_325f_${crypto.randomUUID().replaceAll('-', '')}`
  let admin: SQL | undefined
  let database: TestDatabase | undefined

  function db(): TestDatabase['db'] {
    if (database === undefined) throw new Error('A disposable database is required')
    return database.db
  }

  function resultPorts() {
    const valuation = new DrizzleTripValuationQuery(db(), silentLogger)
    const rules = new DrizzleApplicableFreightRuleQuery(db())
    return createDrizzleExpenseResultPorts(db(), {
      findApplicableRule: (query) => rules.findApplicableRule(query),
      readValuationContexts: (query) => valuation.readValuationContexts(query),
    })
  }

  function forecastPorts() {
    return createDrizzleExpenseForecastPorts(db(), resultPorts())
  }

  async function thresholds(companyId: string): Promise<Record<string, string>> {
    const rows = (await db().execute(sql`
      select cost_group, out_of_pattern_threshold_percent::text as threshold
      from company_expense_allocation_settings where company_id = ${companyId}
    `)) as unknown as { cost_group: string; threshold: string }[]
    return Object.fromEntries(rows.map((row) => [row.cost_group, row.threshold]))
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
    await db().execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    for (const companyId of [companyA, companyB]) {
      await db().execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
      await db().execute(sql`
        insert into user_company_memberships (id, user_id, company_id, status)
        values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')
      `)
    }
  })

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
  })

  test('sem linha o limite é 10 e a troca grava os três grupos rateáveis só da empresa', async () => {
    const ports = forecastPorts()
    expect(await ports.outOfPatternSettings.get({ companyId: companyA })).toBe(10)

    const saved = await createUpdateOutOfPatternSettingsUseCase(ports).execute({
      companyId: companyA,
      correlationId: crypto.randomUUID(),
      thresholdPercent: 12.5,
      updatedBy: userId,
    })

    expect(saved).toBe(12.5)
    expect(await ports.outOfPatternSettings.get({ companyId: companyA })).toBe(12.5)
    expect(await thresholds(companyA)).toEqual({
      administrative: '12.50',
      per_km: '12.50',
      vehicle_fixed: '12.50',
    })
    expect(await thresholds(companyB)).toEqual({})
    expect(await ports.outOfPatternSettings.get({ companyId: companyB })).toBe(10)
  })

  test('trocar de novo atualiza sem duplicar linha e a troca fica no diário', async () => {
    const ports = forecastPorts()
    await createUpdateOutOfPatternSettingsUseCase(ports).execute({
      companyId: companyA,
      correlationId: crypto.randomUUID(),
      thresholdPercent: 7,
      updatedBy: userId,
    })

    expect(await thresholds(companyA)).toEqual({
      administrative: '7.00',
      per_km: '7.00',
      vehicle_fixed: '7.00',
    })
    const audits = (await db().execute(sql`
      select metadata from audit_logs
      where company_id = ${companyA} and action = 'expense_out_of_pattern_settings.update'
      order by created_at
    `)) as unknown as { metadata: { thresholdPercent: number } }[]
    expect(audits.map((row) => row.metadata.thresholdPercent)).toEqual([12.5, 7])
  })

  test('a configuração do rateio não desfaz o limite: o critério muda e o limite fica', async () => {
    const ports = resultPorts()
    await createUpdateExpenseAllocationSettingsUseCase(ports).execute({
      companyId: companyA,
      correlationId: crypto.randomUUID(),
      settings: { administrative: 'equal' },
      updatedBy: userId,
    })

    expect(await thresholds(companyA)).toEqual({
      administrative: '7.00',
      per_km: '7.00',
      vehicle_fixed: '7.00',
    })
  })

  test('empresa sem linha de limite que configura o rateio nasce com o padrão, e a troca de limite a alcança', async () => {
    const ports = resultPorts()
    await createUpdateExpenseAllocationSettingsUseCase(ports).execute({
      companyId: companyB,
      correlationId: crypto.randomUUID(),
      settings: { per_km: 'equal' },
      updatedBy: userId,
    })
    expect(await thresholds(companyB)).toEqual({ per_km: '10.00' })

    await createUpdateOutOfPatternSettingsUseCase(forecastPorts()).execute({
      companyId: companyB,
      correlationId: crypto.randomUUID(),
      thresholdPercent: 20,
      updatedBy: userId,
    })
    expect(await thresholds(companyB)).toEqual({
      administrative: '20.00',
      per_km: '20.00',
      vehicle_fixed: '20.00',
    })
    // A troca de limite não mexeu no critério que a empresa escolheu.
    const [row] = (await db().execute(sql`
      select criterion from company_expense_allocation_settings
      where company_id = ${companyB} and cost_group = 'per_km'
    `)) as unknown as { criterion: string }[]
    expect(row?.criterion).toBe('equal')
  })

  test('o CHECK recusa limite fora de 0 a 1000', async () => {
    const update = async (): Promise<void> => {
      await db().execute(sql`
        update company_expense_allocation_settings set out_of_pattern_threshold_percent = 1000.01
        where company_id = ${companyA}
      `)
    }
    await expect(update()).rejects.toThrow()
  })

  test('sem perfil fiscal o mês conta de segunda a sexta', async () => {
    const days = await forecastPorts().calendar.businessDaysByMonth({
      companyId: companyA,
      months: ['2026-11', '2026-12'],
    })

    // Novembro de 2026 tem 21 dias de segunda a sexta, dezembro 23.
    expect(days.get('2026-11')).toBe(21)
    expect(days.get('2026-12')).toBe(23)
  })

  test('o caso de uso roda sobre o SQL real e, sem dado, não há previsão nem alerta', async () => {
    const result = await createGetExpenseForecastUseCase(forecastPorts()).execute({
      companyId: companyA,
      month: '2026-11',
    })

    expect(result.forecast.status).toBe('unavailable')
    expect(result.forecast.monthsOfData).toBe(0)
    expect(result.outOfPattern).toEqual([])
    expect(result.thresholdPercent).toBe(7)
    expect(result.nextMonthBusinessDays).toBe(23)
  })
})
