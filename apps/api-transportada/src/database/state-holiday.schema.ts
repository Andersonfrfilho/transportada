/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  BRAZILIAN_STATE_IBGE_CODE_LIST,
  HOLIDAY_NAME_MAX_LENGTH,
  HOLIDAY_RECURRENCE,
} from '../shared/business-calendar.constant.js'
import { companies } from './identity.schema.js'
import { inList, monthDayInRangeSql } from './schema-check.constant.js'

const recurrenceIs = (value: string) => sql.raw(`'${value}'`)

/**
 * Spec 238 RF4 / ADR-0096 §Modelo de dados: o feriado do estado, em data fixa (`once`) ou todo ano
 * (`yearly`, com mês e dia). Não é materializado: o roteiro só lê feriado municipal, então a política
 * expande o `yearly` na leitura.
 *
 * ⚠️ O CHECK de forma exige `month`/`day` `is not null` na ponta `yearly`: sem isso, `month between 1
 * and 12` com `month` nulo dá NULL, e CHECK aceita NULL — o `yearly` sem mês passaria em silêncio.
 * A unicidade é por forma, em índices PARCIAIS: um `once` e um `yearly` na mesma data coexistem.
 */
export const stateHolidays = pgTable(
  'state_holidays',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    stateIbgeCode: text('state_ibge_code').notNull(),
    recurrence: text().notNull(),
    holidayOn: date('holiday_on'),
    month: integer(),
    day: integer(),
    name: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'state_holidays_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    uniqueIndex('state_holidays_company_state_once_unique')
      .on(table.companyId, table.stateIbgeCode, table.holidayOn)
      .where(sql`${table.recurrence} = ${recurrenceIs(HOLIDAY_RECURRENCE.ONCE)}`),
    uniqueIndex('state_holidays_company_state_yearly_unique')
      .on(table.companyId, table.stateIbgeCode, table.month, table.day)
      .where(sql`${table.recurrence} = ${recurrenceIs(HOLIDAY_RECURRENCE.YEARLY)}`),
    check(
      'state_holidays_state_check',
      sql`${table.stateIbgeCode} in (${sql.raw(inList(BRAZILIAN_STATE_IBGE_CODE_LIST))})`,
    ),
    check(
      'state_holidays_recurrence_check',
      sql`${table.recurrence} in (${sql.raw(inList(Object.values(HOLIDAY_RECURRENCE)))})`,
    ),
    check(
      'state_holidays_name_check',
      sql`char_length(${table.name}) between 1 and ${sql.raw(String(HOLIDAY_NAME_MAX_LENGTH))}`,
    ),
    check(
      'state_holidays_shape_check',
      sql`(${table.recurrence} = ${recurrenceIs(HOLIDAY_RECURRENCE.ONCE)} and ${table.holidayOn} is not null and ${table.month} is null and ${table.day} is null) or (${table.recurrence} = ${recurrenceIs(HOLIDAY_RECURRENCE.YEARLY)} and ${table.holidayOn} is null and ${table.month} is not null and ${table.day} is not null and ${monthDayInRangeSql({ day: table.day, month: table.month })})`,
    ),
  ],
)
