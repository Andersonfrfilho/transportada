/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/**
 * Spec 238 T1.3: editar a regra apaga as datas que ela gerou e as gera de novo no dia novo; a data
 * digitada na data antiga fica, porque só as linhas com `source_rule_id` desta regra são dela.
 */
import { and, eq } from 'drizzle-orm'

import { municipalHolidays } from '../../database/delivery-client.schema.js'
import { municipalHolidayRules } from '../../database/municipal-holiday-rule.schema.js'
import { buildMaterializationYears } from '../application/municipal-holiday-materialization.service.js'
import type {
  MunicipalHolidayRuleChanges,
  MunicipalHolidayRuleRecord,
} from '../application/municipal-holiday-rule.port.js'
import {
  BUSINESS_CALENDAR_AUDIT_ACTION,
  BUSINESS_CALENDAR_AUDIT_TARGET,
} from '../domain/business-calendar-audit.constant.js'
import {
  MunicipalHolidayRuleConflictError,
  MunicipalHolidayRuleInvalidDayError,
} from '../domain/business-calendar-rule.error.js'
import { isValidMonthDay } from '../domain/civil-date.policy.js'
import { appendBusinessCalendarAudit } from './business-calendar-audit.support.js'
import type { BusinessCalendarTransaction } from './business-calendar-database.types.js'
import { requirePersistedRow } from './business-calendar-persistence.support.js'
import { toRuleRecord } from './business-calendar-rule.mapper.js'
import { insertGeneratedHolidays } from './municipal-holiday-generation.support.js'
import { findRuleByDay, findRuleById, type RuleRow } from './municipal-holiday-rule.queries.js'
import type { Write } from './municipal-holiday-rule.writes.js'

export async function updateRule({
  input,
  transaction,
}: Write<{
  readonly changes: MunicipalHolidayRuleChanges
  readonly currentYear: number
  readonly id: string
}>): Promise<MunicipalHolidayRuleRecord | null> {
  const { companyId } = input
  const previous = await findRuleById({ companyId, id: input.id, transaction })
  if (previous === undefined) return null

  const next = { ...toRuleRecord(previous), ...input.changes }
  if (!isValidMonthDay(next)) throw new MunicipalHolidayRuleInvalidDayError()
  const clash = await findRuleByDay({ ...next, companyId, ignoreId: previous.id, transaction })
  if (clash !== undefined) throw new MunicipalHolidayRuleConflictError()

  const { holidaysCreated, rule } = await rewriteRule({
    companyId,
    currentYear: input.currentYear,
    next,
    previous,
    transaction,
  })
  await appendBusinessCalendarAudit({
    action: BUSINESS_CALENDAR_AUDIT_ACTION.MUNICIPAL_HOLIDAY_RULE_UPDATED,
    actor: input,
    after: rule,
    before: toRuleRecord(previous),
    entityId: rule.id,
    metadata: { holidaysCreated },
    target: BUSINESS_CALENDAR_AUDIT_TARGET.MUNICIPAL_HOLIDAY_RULE,
    transaction,
  })

  return rule
}

/** Apaga as datas que a regra gerou e as gera de novo no dia novo; a digitada na data antiga fica. */
async function rewriteRule(input: {
  readonly companyId: string
  readonly currentYear: number
  readonly next: MunicipalHolidayRuleRecord
  readonly previous: RuleRow
  readonly transaction: BusinessCalendarTransaction
}): Promise<{ readonly holidaysCreated: number; readonly rule: MunicipalHolidayRuleRecord }> {
  const { companyId, next, previous, transaction } = input
  await transaction
    .delete(municipalHolidays)
    .where(
      and(
        eq(municipalHolidays.companyId, companyId),
        eq(municipalHolidays.sourceRuleId, previous.id),
      ),
    )
  const years = buildMaterializationYears({ currentYear: input.currentYear })
  const updated = await transaction
    .update(municipalHolidayRules)
    .set({
      day: next.day,
      kind: next.kind,
      materializedThroughYear: years.toYear,
      month: next.month,
      name: next.name,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(municipalHolidayRules.companyId, companyId),
        eq(municipalHolidayRules.id, previous.id),
      ),
    )
    .returning()
  const rule = toRuleRecord(requirePersistedRow(updated[0]))
  const holidaysCreated = await insertGeneratedHolidays({
    ...years,
    rules: [{ ...rule, companyId }],
    transaction,
  })

  return { holidaysCreated, rule }
}
