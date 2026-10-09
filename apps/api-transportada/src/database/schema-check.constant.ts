/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'

import {
  BRAZILIAN_STATE_IBGE_CODE_LIST,
  CITY_IBGE_CODE_SOURCE,
} from '../shared/business-calendar.constant.js'
import {
  HOLIDAY_PROVIDER_NATIONAL_CODE,
  HOLIDAY_PROVIDER_SCOPE,
  HOLIDAY_PROVIDER_SCOPES,
  HOLIDAY_PROVIDER_TYPES_BY_SCOPE,
  type HolidayProviderScope,
} from '../shared/holiday-provider.constant.js'

/** Renders a literal enumeration for an `in (...)` check constraint. */
export const inList = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(', ')

/** Último dia do mês, com 29/02 válido: o dia civil existe todo ano bissexto e a regra "todo ano" o guarda. */
export const lastDayOfMonthSql = (month: SQLWrapper): SQL =>
  sql`(case when ${month} = 2 then 29 when ${month} in (4, 6, 9, 11) then 30 else 31 end)`

/** Mês de 1 a 12 e dia de 1 ao último dia daquele mês. NULL passaria no CHECK: exija `not null` à parte. */
export const monthDayInRangeSql = (columns: { day: SQLWrapper; month: SQLWrapper }): SQL =>
  sql`${columns.month} between 1 and 12 and ${columns.day} between 1 and ${lastDayOfMonthSql(columns.month)}`

/**
 * A forma do código IBGE por escopo do fornecedor de feriados: município de 7 dígitos, UF de 2, ou `BR`
 * para o nacional. Nulo nunca vale (as colunas são NOT NULL), e é por isso que o único segura.
 */
export const holidayScopeCodeSql = (
  columns: { ibgeCode: SQLWrapper; scope: SQLWrapper },
  scopes: readonly HolidayProviderScope[],
): SQL => {
  const { ibgeCode, scope } = columns
  const shapes: Record<HolidayProviderScope, SQL> = {
    [HOLIDAY_PROVIDER_SCOPE.CITY]: sql`${scope} = 'city' and ${ibgeCode} ~ ${sql.raw(`'${CITY_IBGE_CODE_SOURCE}'`)}`,
    [HOLIDAY_PROVIDER_SCOPE.NATIONAL]: sql`${scope} = 'national' and ${ibgeCode} = ${sql.raw(`'${HOLIDAY_PROVIDER_NATIONAL_CODE}'`)}`,
    [HOLIDAY_PROVIDER_SCOPE.STATE]: sql`${scope} = 'state' and ${ibgeCode} in (${sql.raw(inList(BRAZILIAN_STATE_IBGE_CODE_LIST))})`,
  }

  return sql.join(
    scopes.map((holidayScope) => sql`(${shapes[holidayScope]})`),
    sql` or `,
  )
}

/** O tipo da entrada combina com o escopo (`HOLIDAY_PROVIDER_TYPES_BY_SCOPE`). */
export const holidayScopeTypeSql = (columns: {
  providerType: SQLWrapper
  scope: SQLWrapper
}): SQL =>
  sql.join(
    HOLIDAY_PROVIDER_SCOPES.map(
      (holidayScope) =>
        sql`(${columns.scope} = ${sql.raw(`'${holidayScope}'`)} and ${columns.providerType} in (${sql.raw(inList(HOLIDAY_PROVIDER_TYPES_BY_SCOPE[holidayScope]))}))`,
    ),
    sql` or `,
  )
