/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, count, eq, ne } from 'drizzle-orm'

import { municipalHolidays } from '../../database/delivery-client.schema.js'
import { municipalHolidayRules } from '../../database/municipal-holiday-rule.schema.js'
import type { BusinessCalendarTransaction } from './business-calendar-database.types.js'

export type RuleRow = typeof municipalHolidayRules.$inferSelect

type RuleLookup = {
  readonly companyId: string
  readonly transaction: BusinessCalendarTransaction
}

export async function findRuleById(
  input: RuleLookup & { readonly id: string },
): Promise<RuleRow | undefined> {
  const [row] = await input.transaction
    .select()
    .from(municipalHolidayRules)
    .where(
      and(
        eq(municipalHolidayRules.companyId, input.companyId),
        eq(municipalHolidayRules.id, input.id),
      ),
    )
    .limit(1)
  return row
}

/** A cidade e o dia são a identidade da regra: o unique do banco é `(company, city, month, day)`. */
export async function findRuleByDay(
  input: RuleLookup & {
    readonly cityIbgeCode: string
    readonly day: number
    readonly ignoreId?: string
    readonly month: number
  },
): Promise<RuleRow | undefined> {
  const [row] = await input.transaction
    .select()
    .from(municipalHolidayRules)
    .where(
      and(
        eq(municipalHolidayRules.companyId, input.companyId),
        eq(municipalHolidayRules.cityIbgeCode, input.cityIbgeCode),
        eq(municipalHolidayRules.month, input.month),
        eq(municipalHolidayRules.day, input.day),
        ...(input.ignoreId === undefined ? [] : [ne(municipalHolidayRules.id, input.ignoreId)]),
      ),
    )
    .limit(1)
  return row
}

export async function countGeneratedHolidays(
  input: RuleLookup & { readonly ruleId: string },
): Promise<number> {
  const [row] = await input.transaction
    .select({ total: count() })
    .from(municipalHolidays)
    .where(
      and(
        eq(municipalHolidays.companyId, input.companyId),
        eq(municipalHolidays.sourceRuleId, input.ruleId),
      ),
    )
  return row?.total ?? 0
}
