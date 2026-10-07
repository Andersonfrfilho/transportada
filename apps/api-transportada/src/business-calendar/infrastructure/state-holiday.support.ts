/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, ne } from 'drizzle-orm'

import { stateHolidays } from '../../database/state-holiday.schema.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type {
  StateHolidayChanges,
  StateHolidayInput,
  StateHolidayRecord,
} from '../application/state-holiday.port.js'
import { BUSINESS_CALENDAR_AUDIT_TARGET } from '../domain/business-calendar-audit.constant.js'
import { StateHolidayConflictError } from '../domain/business-calendar-rule.error.js'
import { HOLIDAY_RECURRENCE } from '../domain/business-calendar.constant.js'
import { appendBusinessCalendarAudit } from './business-calendar-audit.support.js'
import type { BusinessCalendarTransaction } from './business-calendar-database.types.js'

type StateHolidayRow = typeof stateHolidays.$inferSelect
type Candidate = StateHolidayInput & { readonly companyId: string }

export async function findRow(input: {
  readonly companyId: string
  readonly id: string
  readonly transaction: BusinessCalendarTransaction
}): Promise<StateHolidayRow | undefined> {
  const [row] = await input.transaction
    .select()
    .from(stateHolidays)
    .where(and(eq(stateHolidays.companyId, input.companyId), eq(stateHolidays.id, input.id)))
    .limit(1)
  return row
}

/** Mesma UF e mesma data, na mesma forma: é o que os dois únicos parciais do banco já recusam. */
export async function assertNoConflict(input: {
  readonly candidate: Candidate
  readonly ignoreId?: string
  readonly transaction: BusinessCalendarTransaction
}): Promise<void> {
  const { candidate } = input
  const sameDate =
    candidate.recurrence === HOLIDAY_RECURRENCE.ONCE
      ? and(
          eq(stateHolidays.recurrence, HOLIDAY_RECURRENCE.ONCE),
          eq(stateHolidays.holidayOn, candidate.holidayOn),
        )
      : and(
          eq(stateHolidays.recurrence, HOLIDAY_RECURRENCE.YEARLY),
          eq(stateHolidays.month, candidate.month),
          eq(stateHolidays.day, candidate.day),
        )
  const [existing] = await input.transaction
    .select({ id: stateHolidays.id })
    .from(stateHolidays)
    .where(
      and(
        eq(stateHolidays.companyId, candidate.companyId),
        eq(stateHolidays.stateIbgeCode, candidate.stateIbgeCode),
        sameDate,
        ...(input.ignoreId === undefined ? [] : [ne(stateHolidays.id, input.ignoreId)]),
      ),
    )
    .limit(1)
  if (existing !== undefined) throw new StateHolidayConflictError()
}

export function toInsertValues(
  input: StateHolidayInput,
): Omit<typeof stateHolidays.$inferInsert, 'companyId'> {
  const shared = {
    name: input.name,
    recurrence: input.recurrence,
    stateIbgeCode: input.stateIbgeCode,
  }
  return input.recurrence === HOLIDAY_RECURRENCE.ONCE
    ? { ...shared, holidayOn: input.holidayOn }
    : { ...shared, day: input.day, month: input.month }
}

export function applyChanges(input: {
  readonly changes: StateHolidayChanges
  readonly row: StateHolidayRow
}): StateHolidayRow {
  const { changes, row } = input
  const name = changes.name ?? row.name
  if (changes.recurrence === HOLIDAY_RECURRENCE.ONCE) {
    return { ...row, holidayOn: changes.holidayOn ?? row.holidayOn, name }
  }
  return { ...row, day: changes.day ?? row.day, month: changes.month ?? row.month, name }
}

/** Só o que o corpo trouxe: a forma não muda e o resto da linha fica como está. */
export function toSetValues(
  changes: StateHolidayChanges,
): Partial<typeof stateHolidays.$inferInsert> {
  const name = changes.name === undefined ? {} : { name: changes.name }
  if (changes.recurrence === HOLIDAY_RECURRENCE.ONCE) {
    return { ...name, ...(changes.holidayOn === undefined ? {} : { holidayOn: changes.holidayOn }) }
  }
  return {
    ...name,
    ...(changes.day === undefined ? {} : { day: changes.day }),
    ...(changes.month === undefined ? {} : { month: changes.month }),
  }
}

export async function appendAudit(input: {
  readonly action: string
  readonly actor: BusinessCalendarActor
  readonly after: StateHolidayRecord | null
  readonly before: StateHolidayRecord | null
  readonly row: StateHolidayRow
  readonly transaction: BusinessCalendarTransaction
}): Promise<void> {
  await appendBusinessCalendarAudit({
    action: input.action,
    actor: input.actor,
    after: input.after,
    before: input.before,
    entityId: input.row.id,
    target: BUSINESS_CALENDAR_AUDIT_TARGET.STATE_HOLIDAY,
    transaction: input.transaction,
  })
}
