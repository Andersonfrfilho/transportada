/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'

import { municipalHolidays } from '../../database/delivery-client.schema.js'
import { municipalHolidayRules } from '../../database/municipal-holiday-rule.schema.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import { BUSINESS_CALENDAR_AUDIT_TARGET } from '../domain/business-calendar-audit.constant.js'
import { appendBusinessCalendarAudit } from './business-calendar-audit.support.js'
import type { BusinessCalendarTransaction } from './business-calendar-database.types.js'
import { requirePersistedRow } from './business-calendar-persistence.support.js'
import { toHolidayRecord, toRuleRecord } from './business-calendar-rule.mapper.js'
import { insertGeneratedHolidays } from './municipal-holiday-generation.support.js'

type HolidayRow = typeof municipalHolidays.$inferSelect

export async function findById(input: {
  readonly companyId: string
  readonly id: string
  readonly transaction: BusinessCalendarTransaction
}): Promise<HolidayRow | undefined> {
  const [row] = await input.transaction
    .select()
    .from(municipalHolidays)
    .where(
      and(eq(municipalHolidays.companyId, input.companyId), eq(municipalHolidays.id, input.id)),
    )
    .limit(1)
  return row
}

export async function findByDay(input: {
  readonly cityIbgeCode: string
  readonly companyId: string
  readonly holidayOn: string
  readonly transaction: BusinessCalendarTransaction
}): Promise<HolidayRow | undefined> {
  const [row] = await input.transaction
    .select()
    .from(municipalHolidays)
    .where(
      and(
        eq(municipalHolidays.companyId, input.companyId),
        eq(municipalHolidays.cityIbgeCode, input.cityIbgeCode),
        eq(municipalHolidays.holidayOn, input.holidayOn),
      ),
    )
    .limit(1)
  return row
}

type RegenerateParams = {
  readonly companyId: string
  readonly currentYear: number
  readonly removed: HolidayRow
  readonly transaction: BusinessCalendarTransaction
}

/**
 * Só dentro do horizonte que a regra já gerou (do ano corrente até `materialized_through_year`): a
 * data de um ano passado ou além do horizonte nunca foi dela, e regenerá-la mentiria sobre o alcance.
 */
export async function regenerateRuleDate(input: RegenerateParams): Promise<string | null> {
  const { companyId, removed, transaction } = input
  const year = Number(removed.holidayOn.slice(0, 4))
  const month = Number(removed.holidayOn.slice(5, 7))
  const day = Number(removed.holidayOn.slice(8, 10))
  const [rule] = await transaction
    .select()
    .from(municipalHolidayRules)
    .where(
      and(
        eq(municipalHolidayRules.companyId, companyId),
        eq(municipalHolidayRules.cityIbgeCode, removed.cityIbgeCode),
        eq(municipalHolidayRules.month, month),
        eq(municipalHolidayRules.day, day),
      ),
    )
    .limit(1)
  if (rule === undefined) return null
  if (year < input.currentYear || year > rule.materializedThroughYear) return null

  await insertGeneratedHolidays({
    fromYear: year,
    rules: [{ ...toRuleRecord(rule), companyId }],
    toYear: year,
    transaction,
  })
  return rule.id
}

export async function audit(input: {
  readonly action: string
  readonly actor: BusinessCalendarActor
  readonly after: HolidayRow | null
  readonly before: HolidayRow | undefined
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly transaction: BusinessCalendarTransaction
}): Promise<void> {
  const subject = input.after ?? input.before
  await appendBusinessCalendarAudit({
    action: input.action,
    actor: input.actor,
    after: input.after === null ? null : toHolidayRecord(input.after),
    before: input.before === undefined ? null : toHolidayRecord(input.before),
    entityId: requirePersistedRow(subject).id,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    target: BUSINESS_CALENDAR_AUDIT_TARGET.MUNICIPAL_HOLIDAY,
    transaction: input.transaction,
  })
}
