/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.2: o feriado estadual (data fixa ou todo ano, sem materializar — o roteiro não o lê) e
 * a configuração de sábado da empresa (uma linha por empresa; ausência = sábado não é dia útil).
 */
import { getTableConfig } from 'drizzle-orm/pg-core'

import { describe, expect, test } from 'bun:test'

import {
  companyBusinessCalendarSettings,
  municipalHolidayRules,
  municipalHolidays,
  stateHolidays,
} from '../../src/database/database.schema.js'
import {
  columnNames,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  foreignKeys,
  indexColumnsByName,
  requiredColumnNames,
  uniqueIndexWhereSqlByName,
  unqualifiedCheckSqlByName,
} from '../fiscal-schema/support.js'

const POSTGRES_IDENTIFIER_MAX_BYTES = 63

describe('o feriado estadual (spec 238 T1.2)', () => {
  test('colunas: data fixa ou mês e dia, nunca os dois', () => {
    expect(columnNames(stateHolidays)).toEqual([
      'id',
      'company_id',
      'state_ibge_code',
      'recurrence',
      'holiday_on',
      'month',
      'day',
      'name',
      'created_at',
      'updated_at',
      'provider_entry_id',
    ])
    expect(requiredColumnNames(stateHolidays)).toEqual([
      'id',
      'company_id',
      'state_ibge_code',
      'recurrence',
      'name',
      'created_at',
      'updated_at',
    ])
    expectGeneratedUuidPrimaryKey(stateHolidays)
    expectRequiredUtcTimestamps(stateHolidays)
  })

  test('o CHECK de forma fecha o buraco do NULL: `yearly` exige mês e dia explícitos', () => {
    const checks = unqualifiedCheckSqlByName(stateHolidays)

    expect(checks.state_holidays_shape_check).toBe(
      '("recurrence" = \'once\' and "holiday_on" is not null and "month" is null and "day" is null) or ("recurrence" = \'yearly\' and "holiday_on" is null and "month" is not null and "day" is not null and "month" between 1 and 12 and "day" between 1 and (case when "month" = 2 then 29 when "month" in (4, 6, 9, 11) then 30 else 31 end))',
    )
    expect(checks.state_holidays_recurrence_check).toBe(`"recurrence" in ('once', 'yearly')`)
    expect(checks.state_holidays_name_check).toBe('char_length("name") between 1 and 120')
    expect(checks.state_holidays_state_check).toContain('"state_ibge_code" in (')
  })

  test('dois únicos PARCIAIS, um por forma — e cada um só vale para a sua', () => {
    const where = uniqueIndexWhereSqlByName(stateHolidays)

    expect(indexColumnsByName(stateHolidays)).toEqual({
      state_holidays_company_state_once_unique: ['company_id', 'state_ibge_code', 'holiday_on'],
      state_holidays_company_state_yearly_unique: ['company_id', 'state_ibge_code', 'month', 'day'],
      state_holidays_provider_entry_idx: ['company_id', 'provider_entry_id'],
    })
    expect(where.state_holidays_company_state_once_unique).toBe(
      '"state_holidays"."recurrence" = \'once\'',
    )
    expect(where.state_holidays_company_state_yearly_unique).toBe(
      '"state_holidays"."recurrence" = \'yearly\'',
    )
  })

  test('a empresa é âncora com RESTRICT', () => {
    expect(foreignKeys(stateHolidays)).toEqual([
      {
        columns: ['company_id'],
        foreignColumns: ['id'],
        foreignTable: 'companies',
        name: 'state_holidays_company_id_companies_id_fk',
        onDelete: 'restrict',
        onUpdate: 'cascade',
      },
      {
        columns: ['provider_entry_id', 'state_ibge_code', 'holiday_on'],
        foreignColumns: ['id', 'ibge_code', 'holiday_on'],
        foreignTable: 'holiday_provider_entries',
        name: 'state_holidays_provider_entry_fk',
        onDelete: 'restrict',
        onUpdate: 'restrict',
      },
    ])
  })
})

describe('a configuração de sábado da empresa (spec 238 T1.2)', () => {
  const findColumn = (name: string) =>
    getTableConfig(companyBusinessCalendarSettings).columns.find((column) => column.name === name)

  test('uma linha por empresa; sem linha, sábado não é dia útil', () => {
    expect(columnNames(companyBusinessCalendarSettings)).toEqual([
      'company_id',
      'saturday_is_business_day',
      'updated_by_user_id',
      'created_at',
      'updated_at',
    ])
    expect(findColumn('company_id')?.primary).toBeTrue()
    expect(findColumn('saturday_is_business_day')?.default).toBe(false)
    expect(findColumn('saturday_is_business_day')?.notNull).toBeTrue()
    expect(findColumn('updated_by_user_id')?.notNull).toBeTrue()
    expectRequiredUtcTimestamps(companyBusinessCalendarSettings)
  })

  test('só a empresa tem FK: o autor sobrevive ao usuário, como no molde da retenção', () => {
    expect(foreignKeys(companyBusinessCalendarSettings)).toEqual([
      {
        columns: ['company_id'],
        foreignColumns: ['id'],
        foreignTable: 'companies',
        name: 'company_business_calendar_settings_company_id_companies_id_fk',
        onDelete: 'restrict',
        onUpdate: 'cascade',
      },
    ])
  })
})

describe('os nomes de identificador cabem em 63 bytes (o Postgres trunca em silêncio)', () => {
  test('tabelas, restrições e índices das quatro tabelas', () => {
    const names = [
      municipalHolidayRules,
      municipalHolidays,
      stateHolidays,
      companyBusinessCalendarSettings,
    ]
      .map((table) => getTableConfig(table))
      .flatMap((config) => [
        config.name,
        ...config.checks.map((constraint) => constraint.name),
        ...config.uniqueConstraints.map((constraint) => constraint.name ?? ''),
        ...config.foreignKeys.map((foreignKey) => foreignKey.getName()),
        ...config.indexes.map((tableIndex) => tableIndex.config.name ?? ''),
      ])

    expect(names.length).toBeGreaterThan(20)
    for (const name of names) {
      expect(name).not.toBe('')
      expect(Buffer.byteLength(name)).toBeLessThanOrEqual(POSTGRES_IDENTIFIER_MAX_BYTES)
    }
  })
})
