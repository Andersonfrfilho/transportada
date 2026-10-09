/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3b: a data digitada à mão (`source_rule_id` nulo) no dia de uma regra "todo ano". A regra
 * não a conhece, e ela segue valendo para o roteirizador depois que a regra muda ou some. Spec 252: a
 * importada (`provider_entry_id` preenchido) não é digitada — é do fornecedor, e só vira "digitada que
 * ficou" depois de adotada.
 */
import { and, count, eq, gte, isNull, sql, type SQL } from 'drizzle-orm'

import { municipalHolidays } from '../../database/delivery-client.schema.js'
import { formatCivilDate } from '../domain/civil-date.policy.js'
import type { BusinessCalendarDatabase } from './business-calendar-database.types.js'

type Executor = Pick<BusinessCalendarDatabase, 'select'>

type TypedScope = {
  readonly cityIbgeCode?: string
  readonly companyId: string
  readonly currentYear: number
  readonly executor: Executor
}

const MONTH_OF_DATE = sql<number>`extract(month from ${municipalHolidays.holidayOn})::int`.mapWith(
  Number,
)
const DAY_OF_DATE = sql<number>`extract(day from ${municipalHolidays.holidayOn})::int`.mapWith(
  Number,
)

export function buildTypedDayKey(input: {
  readonly cityIbgeCode: string
  readonly day: number
  readonly month: number
}): string {
  return `${input.cityIbgeCode}:${String(input.month)}:${String(input.day)}`
}

function typedConditions(input: TypedScope): readonly SQL[] {
  return [
    isNull(municipalHolidays.sourceRuleId),
    isNull(municipalHolidays.providerEntryId),
    gte(
      municipalHolidays.holidayOn,
      formatCivilDate({ day: 1, month: 1, year: input.currentYear }),
    ),
    ...(input.cityIbgeCode === undefined
      ? []
      : [eq(municipalHolidays.cityIbgeCode, input.cityIbgeCode)]),
  ]
}

/** Uma consulta agregada para a lista inteira: a contagem de cada regra sai de um mapa, sem N+1. */
export async function countTypedHolidaysByDay(
  input: TypedScope,
): Promise<ReadonlyMap<string, number>> {
  const rows = await input.executor
    .select({
      cityIbgeCode: municipalHolidays.cityIbgeCode,
      day: DAY_OF_DATE,
      month: MONTH_OF_DATE,
      total: count(),
    })
    .from(municipalHolidays)
    .where(and(eq(municipalHolidays.companyId, input.companyId), ...typedConditions(input)))
    .groupBy(municipalHolidays.cityIbgeCode, MONTH_OF_DATE, DAY_OF_DATE)

  return new Map(rows.map((row) => [buildTypedDayKey(row), row.total]))
}

export async function countTypedHolidaysOnDay(
  input: TypedScope & {
    readonly cityIbgeCode: string
    readonly day: number
    readonly month: number
  },
): Promise<number> {
  const [row] = await input.executor
    .select({ total: count() })
    .from(municipalHolidays)
    .where(
      and(
        eq(municipalHolidays.companyId, input.companyId),
        ...typedConditions(input),
        sql`${MONTH_OF_DATE} = ${input.month}`,
        sql`${DAY_OF_DATE} = ${input.day}`,
      ),
    )
  return row?.total ?? 0
}
