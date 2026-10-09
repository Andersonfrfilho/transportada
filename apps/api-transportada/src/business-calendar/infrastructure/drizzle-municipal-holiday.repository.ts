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
  SaveMunicipalHolidayResult,
} from '../application/municipal-holiday.port.js'
import { BUSINESS_CALENDAR_AUDIT_ACTION } from '../domain/business-calendar-audit.constant.js'
import { MunicipalHolidayGeneratedByRuleError } from '../domain/business-calendar-rule.error.js'
import type { BusinessCalendarDatabase } from './business-calendar-database.types.js'
import { acquireBusinessCalendarLock } from './business-calendar-lock.support.js'
import { requirePersistedRow } from './business-calendar-persistence.support.js'
import { toHolidayRecord } from './business-calendar-rule.mapper.js'
import {
  disableImportedMunicipalHoliday,
  suppressDeletedMunicipalHoliday,
} from './holiday-import-disable.support.js'
import {
  audit,
  findByDay,
  findById,
  isSameTypedHoliday,
  regenerateRuleDate,
  upsertTypedHoliday,
} from './municipal-holiday.support.js'

/**
 * A tabela que o roteirizador lê, com a data digitada, a gerada e a importada lado a lado. A digitada
 * manda; a gerada só se mexe pela regra (409); a importada, ao ser editada ou cadastrada de novo, vira
 * digitada (adoção) e, ao ser apagada, é desligada (supressão). Apagar uma digitada ou desligar uma
 * importada sobre o dia de uma regra gera a da regra de novo, senão o roteiro perderia a data.
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

  /**
   * Recadastrar o mesmo dia corrige o nome; sobre uma data gerada ou importada é adoção, e a linha vira
   * do operador (`adoptedFromRuleId` diz de qual regra). O mesmo cadastro de novo, numa digitada, não muda
   * nada e não audita.
   */
  public save(input: SaveMunicipalHolidayInput): Promise<SaveMunicipalHolidayResult> {
    return this.database.transaction(async (transaction) => {
      const { companyId } = input
      await acquireBusinessCalendarLock({ companyId, transaction })
      const previous = await findByDay({ ...input, transaction })
      if (previous !== undefined && isSameTypedHoliday({ input, previous })) {
        return { adoptedFromRuleId: null, holiday: toHolidayRecord(previous) }
      }
      const adoptedFromRuleId = previous?.sourceRuleId ?? null
      const adoptedFromImport = previous !== undefined && previous.providerEntryId !== null
      const row = await upsertTypedHoliday({ holiday: input, transaction })
      await audit({
        action: BUSINESS_CALENDAR_AUDIT_ACTION.MUNICIPAL_HOLIDAY_SAVED,
        actor: input,
        after: row,
        before: previous,
        metadata: { adoptedFromImport, adoptedFromRuleId },
        transaction,
      })

      return { adoptedFromRuleId, holiday: toHolidayRecord(row) }
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
            .set({ ...input.changes, providerEntryId: null })
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
        metadata: { adoptedFromImport: previous.providerEntryId !== null },
        transaction,
      })

      return toHolidayRecord(row)
    })
  }

  public async remove(
    input: BusinessCalendarActor & {
      readonly currentYear: number
      readonly id: string
      readonly today: string
    },
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const { companyId } = input
      await acquireBusinessCalendarLock({ companyId, transaction })
      const previous = await findById({ companyId, id: input.id, transaction })
      if (previous === undefined) return
      if (previous.sourceRuleId !== null) throw new MunicipalHolidayGeneratedByRuleError()
      if (previous.providerEntryId !== null) {
        await disableImportedMunicipalHoliday({
          actor: input,
          currentYear: input.currentYear,
          row: previous,
          today: input.today,
          transaction,
        })
        return
      }

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
      const suppression = await suppressDeletedMunicipalHoliday({
        actor: input,
        row: previous,
        today: input.today,
        transaction,
      })
      await audit({
        action: BUSINESS_CALENDAR_AUDIT_ACTION.MUNICIPAL_HOLIDAY_DELETED,
        actor: input,
        after: null,
        before: previous,
        metadata: { regeneratedFromRuleId, suppressionId: suppression?.id ?? null },
        transaction,
      })
    })
  }
}
