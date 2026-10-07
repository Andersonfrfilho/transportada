/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.2 (ADR-0096 §Modelo de dados): o feriado "todo ano" (e o aniversário da cidade) é uma
 * regra em tabela própria, e `municipal_holidays` guarda só datas fixas. O banco é a última barreira
 * da cidade, do dia do mês e do nome — a rota (T1.3) valida antes, um INSERT à mão não.
 */
import { describe, expect, test } from 'bun:test'

import { BRAZILIAN_STATE_IBGE_CODES } from '../../src/business-calendar/domain/business-calendar.constant.js'
import { municipalHolidayRules } from '../../src/database/database.schema.js'
import {
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  foreignKeys,
  requiredColumnNames,
  uniqueColumnsByName,
  unqualifiedCheckSqlByName,
} from '../fiscal-schema/support.js'

const MONTH_DAY_CHECK =
  '"month" between 1 and 12 and "day" between 1 and (case when "month" = 2 then 29 when "month" in (4, 6, 9, 11) then 30 else 31 end)'

describe('as regras de feriado municipal "todo ano" (spec 238 T1.2)', () => {
  test('colunas, tipos e obrigatoriedade', () => {
    expect(columnNames(municipalHolidayRules)).toEqual([
      'id',
      'company_id',
      'city_ibge_code',
      'month',
      'day',
      'kind',
      'name',
      'materialized_through_year',
      'created_at',
      'updated_at',
    ])
    expect(requiredColumnNames(municipalHolidayRules)).toEqual(columnNames(municipalHolidayRules))
    expect(columnSqlTypes(municipalHolidayRules)).toMatchObject({
      city_ibge_code: 'text',
      day: 'integer',
      kind: 'text',
      materialized_through_year: 'integer',
      month: 'integer',
      name: 'text',
    })
    expectGeneratedUuidPrimaryKey(municipalHolidayRules)
    expectRequiredUtcTimestamps(municipalHolidayRules)
  })

  test('a empresa é âncora com RESTRICT: apagar empresa não apaga calendário em silêncio', () => {
    expect(foreignKeys(municipalHolidayRules)).toEqual([
      {
        columns: ['company_id'],
        foreignColumns: ['id'],
        foreignTable: 'companies',
        name: 'municipal_holiday_rules_company_id_companies_id_fk',
        onDelete: 'restrict',
        onUpdate: 'cascade',
      },
    ])
  })

  test('a regra é única por empresa, cidade e dia — e tem o par (empresa, id) para a FK composta', () => {
    expect(uniqueColumnsByName(municipalHolidayRules)).toEqual({
      municipal_holiday_rules_company_city_day_unique: [
        'company_id',
        'city_ibge_code',
        'month',
        'day',
      ],
      municipal_holiday_rules_company_id_id_unique: ['company_id', 'id'],
    })
  })

  test('o banco recusa cidade fora do padrão e UF que não existe', () => {
    const checks = unqualifiedCheckSqlByName(municipalHolidayRules)

    expect(checks.municipal_holiday_rules_city_check).toBe('"city_ibge_code" ~ \'^[1-5][0-9]{6}$\'')
    const stateCheck = checks.municipal_holiday_rules_state_check ?? ''
    expect(stateCheck).toContain('substr("city_ibge_code", 1, 2) in (')
    const codes = [...stateCheck.matchAll(/'(\d{2})'/gu)].map((match) => match[1] ?? '')
    expect(new Set(codes)).toEqual(new Set(BRAZILIAN_STATE_IBGE_CODES))
    expect(codes).toHaveLength(27)
  })

  test('o banco recusa mês 13, 31/04 e 30/02, e aceita 29/02', () => {
    expect(
      unqualifiedCheckSqlByName(municipalHolidayRules).municipal_holiday_rules_month_day_check,
    ).toBe(MONTH_DAY_CHECK)
  })

  test('tipo e nome: vocabulário fechado (sem ENUM nativo) e de 1 a 120 caracteres', () => {
    const checks = unqualifiedCheckSqlByName(municipalHolidayRules)

    expect(checks.municipal_holiday_rules_kind_check).toBe(
      `"kind" in ('holiday', 'city_anniversary')`,
    )
    expect(checks.municipal_holiday_rules_name_check).toBe('char_length("name") between 1 and 120')
  })
})
