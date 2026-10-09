/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, ne } from 'drizzle-orm'

import { stateHolidays } from '../../database/state-holiday.schema.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type {
  CreateStateHolidayResult,
  StateHolidayChanges,
  StateHolidayInput,
  StateHolidayRecord,
} from '../application/state-holiday.port.js'
import {
  BUSINESS_CALENDAR_AUDIT_ACTION,
  BUSINESS_CALENDAR_AUDIT_TARGET,
} from '../domain/business-calendar-audit.constant.js'
import {
  ImportedHolidayDateLockedError,
  StateHolidayConflictError,
} from '../domain/business-calendar-rule.error.js'
import { HOLIDAY_RECURRENCE } from '../domain/business-calendar.constant.js'
import { appendBusinessCalendarAudit } from './business-calendar-audit.support.js'
import type { BusinessCalendarTransaction } from './business-calendar-database.types.js'
import { requirePersistedRow } from './business-calendar-persistence.support.js'
import { toStateRecord } from './business-calendar-rule.mapper.js'

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
export async function findSameDate(input: {
  readonly candidate: Candidate
  readonly ignoreId?: string
  readonly transaction: BusinessCalendarTransaction
}): Promise<StateHolidayRow | undefined> {
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
    .select()
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
  return existing
}

/**
 * A importada é a data do fornecedor: nome e tipo adotam a linha, mas outra data é outra linha — desligue
 * esta e cadastre a nova (o municipal já é assim: a data e a cidade são a identidade).
 */
export function assertImportedDateNotMoved(input: {
  readonly changes: StateHolidayChanges
  readonly previous: StateHolidayRow
}): void {
  const { changes, previous } = input
  if (previous.providerEntryId === null || changes.recurrence !== HOLIDAY_RECURRENCE.ONCE) return
  if (changes.holidayOn !== undefined && changes.holidayOn !== previous.holidayOn) {
    throw new ImportedHolidayDateLockedError()
  }
}

export async function assertNoConflict(input: {
  readonly candidate: Candidate
  readonly ignoreId?: string
  readonly transaction: BusinessCalendarTransaction
}): Promise<void> {
  if ((await findSameDate(input)) !== undefined) throw new StateHolidayConflictError()
}

/** O mesmo feriado de novo é a mesma escrita; a mesma data com outro nome é conflito. */
export function resolveExistingStateHoliday(input: {
  readonly existing: StateHolidayRow
  readonly name: string
}): CreateStateHolidayResult {
  if (input.existing.name !== input.name) throw new StateHolidayConflictError()
  return { created: false, holiday: toStateRecord(input.existing) }
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
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly row: StateHolidayRow
  readonly transaction: BusinessCalendarTransaction
}): Promise<void> {
  await appendBusinessCalendarAudit({
    action: input.action,
    actor: input.actor,
    after: input.after,
    before: input.before,
    entityId: input.row.id,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    target: BUSINESS_CALENDAR_AUDIT_TARGET.STATE_HOLIDAY,
    transaction: input.transaction,
  })
}

/**
 * Cadastrar a data de um feriado importado é adoção (ADR-0100 §4): a linha segue a mesma, com o nome do
 * operador, e deixa de apontar para o cache — sem isso o ciclo seguinte a trataria como do fornecedor.
 */
export async function adoptImportedStateHoliday(input: {
  readonly actor: BusinessCalendarActor
  readonly existing: StateHolidayRow
  readonly name: string
  readonly transaction: BusinessCalendarTransaction
}): Promise<CreateStateHolidayResult> {
  const { actor, existing, transaction } = input
  const [row] = await transaction
    .update(stateHolidays)
    .set({ name: input.name, providerEntryId: null, updatedAt: new Date() })
    .where(and(eq(stateHolidays.companyId, actor.companyId), eq(stateHolidays.id, existing.id)))
    .returning()
  const adopted = requirePersistedRow(row)
  await appendAudit({
    action: BUSINESS_CALENDAR_AUDIT_ACTION.STATE_HOLIDAY_UPDATED,
    actor,
    after: toStateRecord(adopted),
    before: toStateRecord(existing),
    metadata: { adoptedFromImport: true },
    row: adopted,
    transaction,
  })
  return { created: false, holiday: toStateRecord(adopted) }
}
