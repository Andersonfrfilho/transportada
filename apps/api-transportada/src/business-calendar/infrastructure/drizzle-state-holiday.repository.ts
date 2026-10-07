/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq } from 'drizzle-orm'

import { stateHolidays } from '../../database/state-holiday.schema.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type {
  CreateStateHolidayResult,
  StateHolidayChanges,
  StateHolidayInput,
  StateHolidayPort,
  StateHolidayRecord,
} from '../application/state-holiday.port.js'
import { BUSINESS_CALENDAR_AUDIT_ACTION } from '../domain/business-calendar-audit.constant.js'
import { StateHolidayRecurrenceMismatchError } from '../domain/business-calendar-rule.error.js'
import type { BusinessCalendarDatabase } from './business-calendar-database.types.js'
import { acquireBusinessCalendarLock } from './business-calendar-lock.support.js'
import { requirePersistedRow } from './business-calendar-persistence.support.js'
import { toStateRecord } from './business-calendar-rule.mapper.js'
import {
  appendAudit,
  applyChanges,
  assertNoConflict,
  findRow,
  findSameDate,
  resolveExistingStateHoliday,
  toInsertValues,
  toSetValues,
} from './state-holiday.support.js'

/** O lock por empresa serializa a conferência de conflito e a escrita; o unique parcial é a rede. */
export class DrizzleStateHolidayRepository implements StateHolidayPort {
  public constructor(private readonly database: BusinessCalendarDatabase) {}

  public async list(input: {
    readonly companyId: string
    readonly stateIbgeCode?: string
  }): Promise<readonly StateHolidayRecord[]> {
    const rows = await this.database
      .select()
      .from(stateHolidays)
      .where(
        and(
          eq(stateHolidays.companyId, input.companyId),
          ...(input.stateIbgeCode === undefined
            ? []
            : [eq(stateHolidays.stateIbgeCode, input.stateIbgeCode)]),
        ),
      )
      .orderBy(
        asc(stateHolidays.stateIbgeCode),
        asc(stateHolidays.month),
        asc(stateHolidays.day),
        asc(stateHolidays.holidayOn),
      )

    return rows.map(toStateRecord)
  }

  public create(
    input: BusinessCalendarActor & StateHolidayInput,
  ): Promise<CreateStateHolidayResult> {
    return this.database.transaction(async (transaction) => {
      await acquireBusinessCalendarLock({ companyId: input.companyId, transaction })
      const existing = await findSameDate({ candidate: input, transaction })
      if (existing !== undefined) return resolveExistingStateHoliday({ existing, name: input.name })

      const row = requirePersistedRow(
        (
          await transaction
            .insert(stateHolidays)
            .values({ ...toInsertValues(input), companyId: input.companyId })
            .returning()
        )[0],
      )
      await appendAudit({
        action: BUSINESS_CALENDAR_AUDIT_ACTION.STATE_HOLIDAY_CREATED,
        actor: input,
        after: toStateRecord(row),
        before: null,
        row,
        transaction,
      })

      return { created: true, holiday: toStateRecord(row) }
    })
  }

  public update(
    input: BusinessCalendarActor & { readonly changes: StateHolidayChanges; readonly id: string },
  ): Promise<StateHolidayRecord | null> {
    return this.database.transaction(async (transaction) => {
      await acquireBusinessCalendarLock({ companyId: input.companyId, transaction })
      const previous = await findRow({ companyId: input.companyId, id: input.id, transaction })
      if (previous === undefined) return null
      if (previous.recurrence !== input.changes.recurrence) {
        throw new StateHolidayRecurrenceMismatchError()
      }
      const values = toSetValues(input.changes)
      await assertNoConflict({
        candidate: {
          ...toStateRecord(applyChanges({ changes: input.changes, row: previous })),
          companyId: input.companyId,
        },
        ignoreId: previous.id,
        transaction,
      })
      const row = requirePersistedRow(
        (
          await transaction
            .update(stateHolidays)
            .set({ ...values, updatedAt: new Date() })
            .where(
              and(eq(stateHolidays.companyId, input.companyId), eq(stateHolidays.id, input.id)),
            )
            .returning()
        )[0],
      )
      await appendAudit({
        action: BUSINESS_CALENDAR_AUDIT_ACTION.STATE_HOLIDAY_UPDATED,
        actor: input,
        after: toStateRecord(row),
        before: toStateRecord(previous),
        row,
        transaction,
      })

      return toStateRecord(row)
    })
  }

  public async remove(input: BusinessCalendarActor & { readonly id: string }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await acquireBusinessCalendarLock({ companyId: input.companyId, transaction })
      const previous = await findRow({ companyId: input.companyId, id: input.id, transaction })
      if (previous === undefined) return

      await transaction
        .delete(stateHolidays)
        .where(and(eq(stateHolidays.companyId, input.companyId), eq(stateHolidays.id, input.id)))
      await appendAudit({
        action: BUSINESS_CALENDAR_AUDIT_ACTION.STATE_HOLIDAY_DELETED,
        actor: input,
        after: null,
        before: toStateRecord(previous),
        row: previous,
        transaction,
      })
    })
  }
}
