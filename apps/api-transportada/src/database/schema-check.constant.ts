/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'

/** Renders a literal enumeration for an `in (...)` check constraint. */
export const inList = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(', ')

/** Último dia do mês, com 29/02 válido: o dia civil existe todo ano bissexto e a regra "todo ano" o guarda. */
export const lastDayOfMonthSql = (month: SQLWrapper): SQL =>
  sql`(case when ${month} = 2 then 29 when ${month} in (4, 6, 9, 11) then 30 else 31 end)`

/** Mês de 1 a 12 e dia de 1 ao último dia daquele mês. NULL passaria no CHECK: exija `not null` à parte. */
export const monthDayInRangeSql = (columns: { day: SQLWrapper; month: SQLWrapper }): SQL =>
  sql`${columns.month} between 1 and 12 and ${columns.day} between 1 and ${lastDayOfMonthSql(columns.month)}`
