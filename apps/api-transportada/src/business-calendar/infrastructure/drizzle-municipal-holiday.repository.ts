/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, gte, lte } from 'drizzle-orm'

import { municipalHolidays } from '../../database/delivery-client.schema.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type {
  MunicipalHoliday,
  MunicipalHolidayChanges,
  MunicipalHolidayPort,
  SaveMunicipalHolidayInput,
} from '../application/municipal-holiday.port.js'
import { BUSINESS_CALENDAR_AUDIT_ACTION } from '../domain/business-calendar-audit.constant.js'
import { MunicipalHolidayGeneratedByRuleError } from '../domain/business-calendar-rule.error.js'
import type { BusinessCalendarDatabase } from './business-calendar-database.types.js'
import { acquireBusinessCalendarLock } from './business-calendar-lock.support.js'
import { requirePersistedRow } from './business-calendar-persistence.support.js'
import { toHolidayRecord } from './business-calendar-rule.mapper.js'
import { audit, findByDay, findById, regenerateRuleDate } from './municipal-holiday.support.js'

/**
 * A tabela que o roteirizador lê, com a data digitada e a gerada lado a lado. A digitada manda; a
 * gerada só se mexe pela regra (409). Apagar uma digitada sobre o dia de uma regra gera a da regra
 * de novo, senão o roteiro perderia a data.
 */
export class DrizzleMunicipalHolidayRepository implements MunicipalHolidayPort {
  public constructor(private readonly database: BusinessCalendarDatabase) {}

  public async list(input: {
    readonly cityIbgeCode?: string
    readonly companyId: string
    readonly from?: string
    readonly to?: string
  }): Promise<readonly MunicipalHoliday[]> {
    const rows = await this.database
      .select()
      .from(municipalHolidays)
      .where(
        and(
          eq(municipalHolidays.companyId, input.companyId),
          ...(input.cityIbgeCode === undefined
            ? []
            : [eq(municipalHolidays.cityIbgeCode, input.cityIbgeCode)]),
          ...(input.from === undefined ? [] : [gte(municipalHolidays.holidayOn, input.from)]),
          ...(input.to === undefined ? [] : [lte(municipalHolidays.holidayOn, input.to)]),
        ),
      )
      .orderBy(asc(municipalHolidays.holidayOn), asc(municipalHolidays.cityIbgeCode))

    return rows.map(toHolidayRecord)
  }

  /** Recadastrar o mesmo dia corrige o nome; sobre uma data gerada é adoção, e a linha vira do operador. */
  public save(input: SaveMunicipalHolidayInput): Promise<MunicipalHoliday> {
    return this.database.transaction(async (transaction) => {
      const { companyId } = input
      await acquireBusinessCalendarLock({ companyId, transaction })
      const previous = await findByDay({ ...input, transaction })
      const row = requirePersistedRow(
        (
          await transaction
            .insert(municipalHolidays)
            .values({
              cityIbgeCode: input.cityIbgeCode,
              companyId,
              holidayOn: input.holidayOn,
              name: input.name,
              ...(input.kind === undefined ? {} : { kind: input.kind }),
            })
            .onConflictDoUpdate({
              set: {
                name: input.name,
                sourceRuleId: null,
                ...(input.kind === undefined ? {} : { kind: input.kind }),
              },
              target: [
                municipalHolidays.companyId,
                municipalHolidays.cityIbgeCode,
                municipalHolidays.holidayOn,
              ],
            })
            .returning()
        )[0],
      )
      await audit({
        action: BUSINESS_CALENDAR_AUDIT_ACTION.MUNICIPAL_HOLIDAY_SAVED,
        actor: input,
        after: row,
        before: previous,
        transaction,
      })

      return toHolidayRecord(row)
    })
  }

  public update(
    input: BusinessCalendarActor & {
      readonly changes: MunicipalHolidayChanges
      readonly id: string
    },
  ): Promise<MunicipalHoliday | null> {
    return this.database.transaction(async (transaction) => {
      const { companyId } = input
      await acquireBusinessCalendarLock({ companyId, transaction })
      const previous = await findById({ companyId, id: input.id, transaction })
      if (previous === undefined) return null
      if (previous.sourceRuleId !== null) throw new MunicipalHolidayGeneratedByRuleError()

      const row = requirePersistedRow(
        (
          await transaction
            .update(municipalHolidays)
            .set(input.changes)
            .where(
              and(
                eq(municipalHolidays.companyId, companyId),
                eq(municipalHolidays.id, previous.id),
              ),
            )
            .returning()
        )[0],
      )
      await audit({
        action: BUSINESS_CALENDAR_AUDIT_ACTION.MUNICIPAL_HOLIDAY_UPDATED,
        actor: input,
        after: row,
        before: previous,
        transaction,
      })

      return toHolidayRecord(row)
    })
  }

  public async remove(
    input: BusinessCalendarActor & { readonly currentYear: number; readonly id: string },
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const { companyId } = input
      await acquireBusinessCalendarLock({ companyId, transaction })
      const previous = await findById({ companyId, id: input.id, transaction })
      if (previous === undefined) return
      if (previous.sourceRuleId !== null) throw new MunicipalHolidayGeneratedByRuleError()

      await transaction
        .delete(municipalHolidays)
        .where(
          and(eq(municipalHolidays.companyId, companyId), eq(municipalHolidays.id, previous.id)),
        )
      const regeneratedFromRuleId = await regenerateRuleDate({
        companyId,
        currentYear: input.currentYear,
        removed: previous,
        transaction,
      })
      await audit({
        action: BUSINESS_CALENDAR_AUDIT_ACTION.MUNICIPAL_HOLIDAY_DELETED,
        actor: input,
        after: null,
        before: previous,
        metadata: { regeneratedFromRuleId },
        transaction,
      })
    })
  }
}
