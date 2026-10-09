/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (ADR-0100 §4): desligar e restaurar o feriado importado. Tudo sob o lock por empresa e na
 * transação do `audit_logs`. Id de outra empresa é ausência — 404 ao desligar, no-op ao restaurar —, nunca
 * um 409 que confirmasse que ele existe.
 */
import { and, asc, count, eq, gte } from 'drizzle-orm'

import { holidayImportSuppressions } from '../../database/holiday-import.schema.js'
import {
  HOLIDAY_PROVIDER_SCOPE,
  isHolidayImportScope,
} from '../../shared/holiday-provider.constant.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type {
  DisableImportedHolidayInput,
  HolidayImportSuppression,
  HolidayImportSuppressionPort,
  HolidayImportSuppressionsPage,
} from '../application/holiday-import.port.js'
import {
  BUSINESS_CALENDAR_AUDIT_ACTION,
  BUSINESS_CALENDAR_AUDIT_TARGET,
} from '../domain/business-calendar-audit.constant.js'
import {
  BusinessCalendarPersistenceError,
  HolidayNotImportedError,
  MunicipalHolidayNotFoundError,
  StateHolidayNotFoundError,
} from '../domain/business-calendar-rule.error.js'
import { appendBusinessCalendarAudit } from './business-calendar-audit.support.js'
import type {
  BusinessCalendarDatabase,
  BusinessCalendarTransaction,
} from './business-calendar-database.types.js'
import { acquireBusinessCalendarLock } from './business-calendar-lock.support.js'
import {
  disableImportedMunicipalHoliday,
  disableImportedStateHoliday,
  type SuppressionRow,
} from './holiday-import-disable.support.js'
import { findById } from './municipal-holiday.support.js'
import { findRow } from './state-holiday.support.js'

/** O CHECK `*_scope_check` é o vocabulário: um escopo fora de cidade e estado na linha é defeito. */
function toSuppression(row: SuppressionRow): HolidayImportSuppression {
  if (!isHolidayImportScope(row.scope)) throw new BusinessCalendarPersistenceError()
  return {
    holidayOn: row.holidayOn,
    ibgeCode: row.ibgeCode,
    id: row.id,
    scope: row.scope,
    suppressedAt: row.suppressedAt,
  }
}

async function disableInTransaction(
  input: DisableImportedHolidayInput,
  transaction: BusinessCalendarTransaction,
): Promise<SuppressionRow> {
  const { companyId } = input
  if (input.scope === HOLIDAY_PROVIDER_SCOPE.CITY) {
    const row = await findById({ companyId, id: input.holidayId, transaction })
    if (row === undefined) throw new MunicipalHolidayNotFoundError()
    if (row.providerEntryId === null) throw new HolidayNotImportedError()
    return disableImportedMunicipalHoliday({
      actor: input,
      currentYear: input.currentYear,
      row,
      today: input.today,
      transaction,
    })
  }
  const row = await findRow({ companyId, id: input.holidayId, transaction })
  if (row === undefined) throw new StateHolidayNotFoundError()
  if (row.providerEntryId === null) throw new HolidayNotImportedError()
  return disableImportedStateHoliday({ actor: input, row, today: input.today, transaction })
}

export class DrizzleHolidayImportSuppressionRepository implements HolidayImportSuppressionPort {
  public constructor(private readonly database: BusinessCalendarDatabase) {}

  public async list(input: {
    readonly companyId: string
    readonly page: number
    readonly perPage: number
    readonly today: string
  }): Promise<HolidayImportSuppressionsPage> {
    const upcoming = and(
      eq(holidayImportSuppressions.companyId, input.companyId),
      gte(holidayImportSuppressions.holidayOn, input.today),
    )
    const [counted] = await this.database
      .select({ total: count() })
      .from(holidayImportSuppressions)
      .where(upcoming)
    const rows = await this.database
      .select()
      .from(holidayImportSuppressions)
      .where(upcoming)
      .orderBy(
        asc(holidayImportSuppressions.holidayOn),
        asc(holidayImportSuppressions.scope),
        asc(holidayImportSuppressions.ibgeCode),
      )
      .limit(input.perPage)
      .offset((input.page - 1) * input.perPage)
    return { items: rows.map(toSuppression), total: counted?.total ?? 0 }
  }

  public disable(input: DisableImportedHolidayInput): Promise<HolidayImportSuppression> {
    return this.database.transaction(async (transaction) => {
      await acquireBusinessCalendarLock({ companyId: input.companyId, transaction })
      return toSuppression(await disableInTransaction(input, transaction))
    })
  }

  public async restore(input: BusinessCalendarActor & { readonly id: string }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const { companyId } = input
      await acquireBusinessCalendarLock({ companyId, transaction })
      const [row] = await transaction
        .select()
        .from(holidayImportSuppressions)
        .where(
          and(
            eq(holidayImportSuppressions.companyId, companyId),
            eq(holidayImportSuppressions.id, input.id),
          ),
        )
        .limit(1)
      if (row === undefined) return

      await transaction
        .delete(holidayImportSuppressions)
        .where(
          and(
            eq(holidayImportSuppressions.companyId, companyId),
            eq(holidayImportSuppressions.id, row.id),
          ),
        )
      await appendBusinessCalendarAudit({
        action: BUSINESS_CALENDAR_AUDIT_ACTION.HOLIDAY_IMPORT_RESTORED,
        actor: input,
        after: null,
        before: toSuppression(row),
        entityId: row.id,
        metadata: { scope: row.scope },
        target: BUSINESS_CALENDAR_AUDIT_TARGET.HOLIDAY_IMPORT_SUPPRESSION,
        transaction,
      })
    })
  }
}
