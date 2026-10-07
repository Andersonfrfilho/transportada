/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/**
 * Spec 238 T1.3: as escritas da regra "todo ano", sempre dentro da transação e do lock da empresa que
 * o repositório abre. Só a regra mexe nas linhas com `source_rule_id`: a data digitada à mão nunca é
 * apagada nem sobrescrita aqui.
 */
import { and, eq } from 'drizzle-orm'

import { municipalHolidayRules } from '../../database/municipal-holiday-rule.schema.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import { buildMaterializationYears } from '../application/municipal-holiday-materialization.service.js'
import type {
  CreateMunicipalHolidayRuleResult,
  MunicipalHolidayRuleFields,
} from '../application/municipal-holiday-rule.port.js'
import {
  BUSINESS_CALENDAR_AUDIT_ACTION,
  BUSINESS_CALENDAR_AUDIT_TARGET,
} from '../domain/business-calendar-audit.constant.js'
import { MunicipalHolidayRuleConflictError } from '../domain/business-calendar-rule.error.js'
import { appendBusinessCalendarAudit } from './business-calendar-audit.support.js'
import type { BusinessCalendarTransaction } from './business-calendar-database.types.js'
import { requirePersistedRow } from './business-calendar-persistence.support.js'
import { toRuleRecord } from './business-calendar-rule.mapper.js'
import { insertGeneratedHolidays } from './municipal-holiday-generation.support.js'
import {
  countGeneratedHolidays,
  findRuleByDay,
  findRuleById,
  type RuleRow,
} from './municipal-holiday-rule.queries.js'

const AUDIT = BUSINESS_CALENDAR_AUDIT_ACTION
const RULE_TARGET = BUSINESS_CALENDAR_AUDIT_TARGET.MUNICIPAL_HOLIDAY_RULE

export type Write<TInput> = {
  readonly input: BusinessCalendarActor & TInput
  readonly transaction: BusinessCalendarTransaction
}

export async function createRule({
  input,
  transaction,
}: Write<MunicipalHolidayRuleFields & { readonly currentYear: number }>): Promise<CreateMunicipalHolidayRuleResult> {
  const { companyId } = input
  const existing = await findRuleByDay({ ...input, transaction })
  if (existing !== undefined) return resolveExisting({ existing, fields: input })

  const years = buildMaterializationYears({ currentYear: input.currentYear })
  const inserted = await transaction
    .insert(municipalHolidayRules)
    .values({
      cityIbgeCode: input.cityIbgeCode,
      companyId,
      day: input.day,
      kind: input.kind,
      materializedThroughYear: years.toYear,
      month: input.month,
      name: input.name,
    })
    .returning()
  const rule = toRuleRecord(requirePersistedRow(inserted[0]))
  const holidaysCreated = await insertGeneratedHolidays({
    ...years,
    rules: [{ ...rule, companyId }],
    transaction,
  })
  await appendBusinessCalendarAudit({
    action: AUDIT.MUNICIPAL_HOLIDAY_RULE_CREATED,
    actor: input,
    after: rule,
    before: null,
    entityId: rule.id,
    metadata: { holidaysCreated },
    target: RULE_TARGET,
    transaction,
  })

  return { created: true, rule }
}

export async function removeRule({
  input,
  transaction,
}: Write<{ readonly id: string }>): Promise<void> {
  const { companyId } = input
  const previous = await findRuleById({ companyId, id: input.id, transaction })
  if (previous === undefined) return

  const generatedHolidaysRemoved = await countGeneratedHolidays({
    companyId,
    ruleId: previous.id,
    transaction,
  })
  // A FK composta apaga em cascata só as datas com `source_rule_id` desta regra.
  await transaction
    .delete(municipalHolidayRules)
    .where(
      and(
        eq(municipalHolidayRules.companyId, companyId),
        eq(municipalHolidayRules.id, previous.id),
      ),
    )
  await appendBusinessCalendarAudit({
    action: AUDIT.MUNICIPAL_HOLIDAY_RULE_DELETED,
    actor: input,
    after: null,
    before: toRuleRecord(previous),
    entityId: previous.id,
    metadata: { generatedHolidaysRemoved },
    target: RULE_TARGET,
    transaction,
  })
}

/** A mesma regra de novo é a mesma escrita (200); nome ou tipo diferente é conflito (409). */
function resolveExisting(input: {
  readonly existing: RuleRow
  readonly fields: MunicipalHolidayRuleFields
}): CreateMunicipalHolidayRuleResult {
  const rule = toRuleRecord(input.existing)
  if (rule.name !== input.fields.name || rule.kind !== input.fields.kind) {
    throw new MunicipalHolidayRuleConflictError()
  }
  return { created: false, rule }
}
