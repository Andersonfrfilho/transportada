/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.2: `municipal_holidays` já está publicada e o roteirizador a lê por `holiday_on`. A
 * migration só acrescenta o tipo e a origem — nada do que o roteirizador usa muda.
 */
import { getTableConfig } from 'drizzle-orm/pg-core'

import { describe, expect, test } from 'bun:test'

import { municipalHolidays } from '../../src/database/database.schema.js'
import {
  columnNames,
  columnSqlTypes,
  foreignKeys,
  indexColumnsByName,
  indexWhereSqlByName,
  requiredColumnNames,
  uniqueColumnsByName,
  unqualifiedCheckSqlByName,
} from '../fiscal-schema/support.js'

const findColumn = (name: string) =>
  getTableConfig(municipalHolidays).columns.find((column) => column.name === name)

describe('as datas fixas de feriado ganham tipo e origem (spec 238 T1.2)', () => {
  test('só duas colunas novas, ao fim das que o roteirizador já lê', () => {
    expect(columnNames(municipalHolidays)).toEqual([
      'id',
      'company_id',
      'city_ibge_code',
      'holiday_on',
      'name',
      'created_at',
      'kind',
      'source_rule_id',
    ])
    expect(columnSqlTypes(municipalHolidays)).toMatchObject({
      holiday_on: 'date',
      kind: 'text',
      source_rule_id: 'uuid',
    })
    expect(requiredColumnNames(municipalHolidays)).toContain('holiday_on')
  })

  test('o tipo nasce `holiday` (o POST antigo, sem tipo, segue válido) e a origem é anulável', () => {
    expect(findColumn('kind')?.notNull).toBeTrue()
    expect(findColumn('kind')?.default).toBe('holiday')
    expect(findColumn('source_rule_id')?.notNull).toBeFalse()
    expect(findColumn('source_rule_id')?.hasDefault).toBeFalse()
  })

  test('o tipo é vocabulário fechado, e o CHECK de cidade antigo não muda', () => {
    const checks = unqualifiedCheckSqlByName(municipalHolidays)

    expect(checks.municipal_holidays_kind_check).toBe(`"kind" in ('holiday', 'city_anniversary')`)
    expect(checks.municipal_holidays_city_check).toContain('^[0-9]{7}$')
    expect(checks.municipal_holidays_name_check).toBe('length("name") > 0')
  })

  test('a origem é FK composta (empresa, regra) com CASCADE: a regra apagada leva só o que gerou', () => {
    expect(foreignKeys(municipalHolidays)).toContainEqual({
      columns: ['company_id', 'source_rule_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'municipal_holiday_rules',
      name: 'municipal_holidays_company_source_rule_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
  })

  test('a chave que o roteirizador usa fica como estava, e a origem tem índice parcial', () => {
    expect(
      uniqueColumnsByName(municipalHolidays).municipal_holidays_company_city_day_unique,
    ).toEqual(['company_id', 'city_ibge_code', 'holiday_on'])
    expect(
      indexColumnsByName(municipalHolidays).municipal_holidays_company_source_rule_idx,
    ).toEqual(['company_id', 'source_rule_id'])
    expect(indexWhereSqlByName(municipalHolidays).municipal_holidays_company_source_rule_idx).toBe(
      '"municipal_holidays"."source_rule_id" is not null',
    )
  })
})
