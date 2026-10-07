/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  BRAZILIAN_STATE_IBGE_CODE_LIST,
  CITY_IBGE_CODE_SOURCE,
  HOLIDAY_NAME_MAX_LENGTH,
  MUNICIPAL_HOLIDAY_KINDS,
} from '../shared/business-calendar.constant.js'
import { companies } from './identity.schema.js'
import { inList, monthDayInRangeSql } from './schema-check.constant.js'

/**
 * Spec 238 / ADR-0096 §Modelo de dados: o feriado "todo ano" (o aniversário da cidade incluído) é uma
 * REGRA, e `municipal_holidays` guarda só datas fixas. O roteirizador casa `holiday_on = data` e não
 * muda: a rota gera uma data fixa por ano a partir daqui (`source_rule_id` liga as duas) e
 * `materialized_through_year` diz até que ano já foi gerada.
 *
 * O par `(company_id, id)` é o alvo da FK composta de `municipal_holidays`: a data gerada não pode
 * apontar para a regra de outra empresa.
 */
export const municipalHolidayRules = pgTable(
  'municipal_holiday_rules',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    cityIbgeCode: text('city_ibge_code').notNull(),
    month: integer().notNull(),
    day: integer().notNull(),
    kind: text().notNull(),
    name: text().notNull(),
    materializedThroughYear: integer('materialized_through_year').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'municipal_holiday_rules_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('municipal_holiday_rules_company_id_id_unique').on(table.companyId, table.id),
    unique('municipal_holiday_rules_company_city_day_unique').on(
      table.companyId,
      table.cityIbgeCode,
      table.month,
      table.day,
    ),
    check(
      'municipal_holiday_rules_city_check',
      sql`${table.cityIbgeCode} ~ ${sql.raw(`'${CITY_IBGE_CODE_SOURCE}'`)}`,
    ),
    check(
      'municipal_holiday_rules_state_check',
      sql`substr(${table.cityIbgeCode}, 1, 2) in (${sql.raw(inList(BRAZILIAN_STATE_IBGE_CODE_LIST))})`,
    ),
    check(
      'municipal_holiday_rules_month_day_check',
      monthDayInRangeSql({ day: table.day, month: table.month }),
    ),
    check(
      'municipal_holiday_rules_kind_check',
      sql`${table.kind} in (${sql.raw(inList(MUNICIPAL_HOLIDAY_KINDS))})`,
    ),
    check(
      'municipal_holiday_rules_name_check',
      sql`char_length(${table.name}) between 1 and ${sql.raw(String(HOLIDAY_NAME_MAX_LENGTH))}`,
    ),
  ],
)
