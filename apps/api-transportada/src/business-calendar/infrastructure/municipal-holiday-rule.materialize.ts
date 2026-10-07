/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray, lt } from 'drizzle-orm'

import { municipalHolidayRules } from '../../database/municipal-holiday-rule.schema.js'
import { buildMaterializationYears } from '../application/municipal-holiday-materialization.service.js'
import type { MaterializationSummary } from '../application/municipal-holiday-rule.port.js'
import {
  BUSINESS_CALENDAR_AUDIT_ACTION,
  BUSINESS_CALENDAR_AUDIT_TARGET,
} from '../domain/business-calendar-audit.constant.js'
import { appendBusinessCalendarAudit } from './business-calendar-audit.support.js'
import { toRuleRecord } from './business-calendar-rule.mapper.js'
import { insertGeneratedHolidays } from './municipal-holiday-generation.support.js'
import type { Write } from './municipal-holiday-rule.writes.js'

/** Sem rotina agendada: esta é a ação que completa o horizonte de todas as regras, e é idempotente. */
export async function materializeRules({
  input,
  transaction,
}: Write<{ readonly currentYear: number }>): Promise<MaterializationSummary> {
  const { companyId } = input
  const rows = await transaction
    .select()
    .from(municipalHolidayRules)
    .where(eq(municipalHolidayRules.companyId, companyId))
  if (rows.length === 0) return { holidaysCreated: 0, rulesProcessed: 0 }

  const years = buildMaterializationYears({ currentYear: input.currentYear })
  const holidaysCreated = await insertGeneratedHolidays({
    ...years,
    rules: rows.map((row) => ({ ...toRuleRecord(row), companyId })),
    transaction,
  })
  await transaction
    .update(municipalHolidayRules)
    .set({ materializedThroughYear: years.toYear })
    .where(
      and(
        eq(municipalHolidayRules.companyId, companyId),
        lt(municipalHolidayRules.materializedThroughYear, years.toYear),
        inArray(
          municipalHolidayRules.id,
          rows.map((row) => row.id),
        ),
      ),
    )
  const summary = { holidaysCreated, rulesProcessed: rows.length }
  await appendBusinessCalendarAudit({
    action: BUSINESS_CALENDAR_AUDIT_ACTION.MUNICIPAL_HOLIDAY_RULE_MATERIALIZED,
    actor: input,
    after: null,
    before: null,
    entityId: companyId,
    metadata: { ...summary, throughYear: years.toYear },
    target: BUSINESS_CALENDAR_AUDIT_TARGET.MUNICIPAL_HOLIDAY_RULE,
    transaction,
  })

  return summary
}
