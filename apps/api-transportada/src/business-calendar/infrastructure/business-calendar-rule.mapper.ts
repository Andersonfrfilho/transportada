/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { requirePersistedRow } from './business-calendar-persistence.support.js'
import type { municipalHolidayRules } from '../../database/municipal-holiday-rule.schema.js'
import type { municipalHolidays } from '../../database/delivery-client.schema.js'
import type { stateHolidays } from '../../database/state-holiday.schema.js'
import type { MunicipalHolidayRuleRecord } from '../application/municipal-holiday-rule.port.js'
import type { MunicipalHoliday } from '../application/municipal-holiday.port.js'
import type { StateHolidayRecord } from '../application/state-holiday.port.js'
import { HOLIDAY_RECURRENCE } from '../domain/business-calendar.constant.js'
import type {
  MunicipalHolidayKind,
  MunicipalHolidayRule,
  StateHolidayRule,
} from '../domain/business-calendar.types.js'

type RuleRow = typeof municipalHolidayRules.$inferSelect
type HolidayRow = typeof municipalHolidays.$inferSelect
type StateHolidayRow = typeof stateHolidays.$inferSelect

// O CHECK `*_kind_check` do banco é o vocabulário; a política confere de novo ao montar o calendário.
const asKind = (value: string): MunicipalHolidayKind => value as MunicipalHolidayKind

export function toRuleRecord(row: RuleRow): MunicipalHolidayRuleRecord {
  return {
    cityIbgeCode: row.cityIbgeCode,
    createdAt: row.createdAt,
    day: row.day,
    id: row.id,
    kind: asKind(row.kind),
    materializedThroughYear: row.materializedThroughYear,
    month: row.month,
    name: row.name,
    updatedAt: row.updatedAt,
  }
}

export function toHolidayRecord(row: HolidayRow): MunicipalHoliday {
  return {
    cityIbgeCode: row.cityIbgeCode,
    generatedByRuleId: row.sourceRuleId,
    holidayOn: row.holidayOn,
    id: row.id,
    kind: asKind(row.kind),
    name: row.name,
  }
}

/** A regra "todo ano" entra na política como `yearly`; a política a expande por ano. */
export function toYearlyMunicipalRule(row: RuleRow): MunicipalHolidayRule {
  return {
    cityIbgeCode: row.cityIbgeCode,
    kind: asKind(row.kind),
    name: row.name,
    occurrence: { day: row.day, month: row.month, recurrence: HOLIDAY_RECURRENCE.YEARLY },
  }
}

/** Só a data digitada à mão: a gerada seria a mesma causa que a regra, contada duas vezes. */
export function toOnceMunicipalRule(row: HolidayRow): MunicipalHolidayRule {
  return {
    cityIbgeCode: row.cityIbgeCode,
    kind: asKind(row.kind),
    name: row.name,
    occurrence: { date: row.holidayOn, recurrence: HOLIDAY_RECURRENCE.ONCE },
  }
}

/** O CHECK de forma do banco garante mês e dia no `yearly` e a data no `once`: a falta é defeito. */
function toStateOccurrence(row: StateHolidayRow): StateHolidayRule['occurrence'] {
  if (row.recurrence === HOLIDAY_RECURRENCE.YEARLY) {
    return {
      day: requirePersistedRow(row.day),
      month: requirePersistedRow(row.month),
      recurrence: HOLIDAY_RECURRENCE.YEARLY,
    }
  }
  return { date: requirePersistedRow(row.holidayOn), recurrence: HOLIDAY_RECURRENCE.ONCE }
}

export function toStateRule(row: StateHolidayRow): StateHolidayRule {
  return {
    name: row.name,
    occurrence: toStateOccurrence(row),
    stateIbgeCode: row.stateIbgeCode,
  }
}

export function toStateRecord(row: StateHolidayRow): StateHolidayRecord {
  const shared = {
    id: row.id,
    name: row.name,
    stateIbgeCode: row.stateIbgeCode,
    updatedAt: row.updatedAt,
  }
  if (row.recurrence === HOLIDAY_RECURRENCE.YEARLY) {
    return {
      ...shared,
      day: requirePersistedRow(row.day),
      month: requirePersistedRow(row.month),
      recurrence: 'yearly',
    }
  }
  return { ...shared, holidayOn: requirePersistedRow(row.holidayOn), recurrence: 'once' }
}
