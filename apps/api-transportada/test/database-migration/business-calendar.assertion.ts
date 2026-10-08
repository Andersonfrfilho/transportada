/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.2: aplica, restringe, faz rollback e reaplica. O rollback tira o que é novo e deixa as
 * datas materializadas como datas fixas comuns — o roteiro continua respeitando-as.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  assertMaterializedHolidays,
  assertRuleConstraints,
  insertRule,
  type CalendarFixture,
} from './business-calendar-constraints.assertion.js'
import {
  assertSettingsConstraints,
  assertStateHolidayConstraints,
} from './business-calendar-state.assertion.js'
import { migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_business_calendar'
const NEW_TABLES = [
  'company_business_calendar_settings',
  'municipal_holiday_rules',
  'state_holidays',
] as const
const NEW_CONSTRAINTS = [
  'company_business_calendar_settings_company_id_companies_id_fk',
  'municipal_holiday_rules_city_check',
  'municipal_holiday_rules_company_city_day_unique',
  'municipal_holiday_rules_company_id_companies_id_fk',
  'municipal_holiday_rules_company_id_id_unique',
  'municipal_holiday_rules_kind_check',
  'municipal_holiday_rules_month_day_check',
  'municipal_holiday_rules_name_check',
  'municipal_holiday_rules_state_check',
  'municipal_holidays_company_source_rule_fk',
  'municipal_holidays_kind_check',
  'state_holidays_company_id_companies_id_fk',
  'state_holidays_name_check',
  'state_holidays_recurrence_check',
  'state_holidays_shape_check',
  'state_holidays_state_check',
] as const
const NEW_INDEXES = [
  'municipal_holidays_company_source_rule_idx',
  'state_holidays_company_state_once_unique',
  'state_holidays_company_state_yearly_unique',
] as const

export type BusinessCalendarProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

type CalendarState = {
  readonly columns: readonly string[]
  readonly constraints: readonly string[]
  readonly indexes: readonly string[]
  readonly tables: readonly string[]
}

async function readState(database: SQL): Promise<CalendarState> {
  const tables = await database<Array<{ readonly name: string }>>`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_name in ${database(NEW_TABLES)} order by 1
  `
  const columns = await database<Array<{ readonly name: string }>>`
    select column_name as name from information_schema.columns
    where table_name = 'municipal_holidays' and column_name in ('kind', 'source_rule_id') order by 1
  `
  const constraints = await database<Array<{ readonly name: string }>>`
    select conname as name from pg_constraint where conname in ${database(NEW_CONSTRAINTS)} order by 1
  `
  const indexes = await database<Array<{ readonly name: string }>>`
    select indexname as name from pg_indexes where indexname in ${database(NEW_INDEXES)} order by 1
  `
  return {
    columns: columns.map((row) => row.name),
    constraints: constraints.map((row) => row.name),
    indexes: indexes.map((row) => row.name),
    tables: tables.map((row) => row.name),
  }
}

const APPLIED: CalendarState = {
  columns: ['kind', 'source_rule_id'],
  constraints: NEW_CONSTRAINTS,
  indexes: NEW_INDEXES,
  tables: NEW_TABLES,
}
const ROLLED_BACK: CalendarState = { columns: [], constraints: [], indexes: [], tables: [] }

async function assertRollbackKeepsFixedDates(
  probe: BusinessCalendarProbe,
  directory: string,
): Promise<void> {
  const { companyId, database } = probe
  const ruleId = await insertRule({ ...probe, otherCompanyId: companyId }, { day: 14, month: 7 })
  await database`
    insert into municipal_holidays (company_id, city_ibge_code, holiday_on, name, kind, source_rule_id)
    values (${companyId}, '3509502', '2026-07-14', 'Aniversário de Campinas', 'city_anniversary', ${ruleId}),
           (${companyId}, '3509502', '2027-07-14', 'Aniversário de Campinas', 'city_anniversary', ${ruleId}),
           (${companyId}, '3509502', '2026-09-20', 'Digitada', 'holiday', null)
  `
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  await database.unsafe(rollback)

  expect(await readState(database)).toEqual(ROLLED_BACK)
  const kept = await database<Array<{ readonly holiday_on: string; readonly name: string }>>`
    select holiday_on::text, name from municipal_holidays where company_id = ${companyId} order by holiday_on
  `
  expect(kept.map((row) => row.holiday_on)).toEqual(['2026-07-14', '2026-09-20', '2027-07-14'])
  const journal = await database<Array<{ readonly name: string }>>`
    select name from drizzle.__drizzle_migrations where name = ${directory}
  `
  expect(journal).toEqual([])
}

export async function assertBusinessCalendar(probe: BusinessCalendarProbe): Promise<void> {
  const { companyId, database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('business_calendar migration is required')

  expect(await readState(database)).toEqual(APPLIED)
  const otherCompanyId = crypto.randomUUID()
  await database`insert into companies (id, status) values (${otherCompanyId}, 'active')`
  const fixture: CalendarFixture = { companyId, database, otherCompanyId }

  await assertRuleConstraints(fixture)
  await assertMaterializedHolidays(fixture)
  await assertStateHolidayConstraints(fixture)
  await assertSettingsConstraints(fixture)
  await database`delete from municipal_holiday_rules where company_id in ${database([companyId, otherCompanyId])}`
  await database`delete from state_holidays where company_id = ${companyId}`
  await database`delete from company_business_calendar_settings where company_id = ${companyId}`
  await database`delete from municipal_holidays where company_id = ${companyId}`

  await assertRollbackKeepsFixedDates(probe, directory)

  await runDatabaseMigrations({ connectionString: probe.connectionString })
  expect(await readState(database)).toEqual(APPLIED)
  const [reapplied] = await database<
    Array<{ readonly kind: string; readonly source_rule_id: string | null }>
  >`
    select kind, source_rule_id from municipal_holidays where holiday_on = '2026-07-14' and company_id = ${companyId}
  `
  expect(reapplied).toEqual({ kind: 'holiday', source_rule_id: null })

  await database`delete from municipal_holidays where company_id = ${companyId}`
  await database`delete from companies where id = ${otherCompanyId}`
}
