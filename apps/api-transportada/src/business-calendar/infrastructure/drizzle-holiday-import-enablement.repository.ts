/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq } from 'drizzle-orm'

import { companyHolidayImportSettings } from '../../database/holiday-import.schema.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type {
  HolidayImportEnablementPort,
  HolidayImportEnablementRecord,
} from '../application/holiday-import-enablement.use-case.js'
import {
  BUSINESS_CALENDAR_AUDIT_ACTION,
  BUSINESS_CALENDAR_AUDIT_TARGET,
} from '../domain/business-calendar-audit.constant.js'
import { appendBusinessCalendarAudit } from './business-calendar-audit.support.js'
import type { BusinessCalendarDatabase } from './business-calendar-database.types.js'
import { acquireBusinessCalendarLock } from './business-calendar-lock.support.js'

/** Sem linha a importação está ligada (`coalesce(is_enabled, true)` das três etapas do worker). */
const ENABLED_BY_DEFAULT = true

/**
 * Spec 262 (RF6): o liga/desliga da importação da empresa. A chave primária é `company_id` e toda instrução filtra
 * pela empresa do contexto. O upsert grava **só** `is_enabled` — as colunas do cursor são da descoberta do worker e
 * um `DO UPDATE` que as tocasse apagaria o ponto onde ela parou.
 */
export class DrizzleHolidayImportEnablementRepository implements HolidayImportEnablementPort {
  public constructor(private readonly database: BusinessCalendarDatabase) {}

  public async find(input: {
    readonly companyId: string
  }): Promise<HolidayImportEnablementRecord | null> {
    const [row] = await this.database
      .select({ isEnabled: companyHolidayImportSettings.isEnabled })
      .from(companyHolidayImportSettings)
      .where(eq(companyHolidayImportSettings.companyId, input.companyId))
      .limit(1)

    return row === undefined ? null : { isEnabled: row.isEnabled }
  }

  public async save(
    input: BusinessCalendarActor & { readonly isEnabled: boolean },
  ): Promise<HolidayImportEnablementRecord | null> {
    return this.database.transaction(async (transaction) => {
      await acquireBusinessCalendarLock({ companyId: input.companyId, transaction })
      const [previous] = await transaction
        .select({ isEnabled: companyHolidayImportSettings.isEnabled })
        .from(companyHolidayImportSettings)
        .where(eq(companyHolidayImportSettings.companyId, input.companyId))
        .limit(1)
      const wasEnabled = previous?.isEnabled ?? ENABLED_BY_DEFAULT
      if (wasEnabled === input.isEnabled) {
        return previous === undefined ? null : { isEnabled: previous.isEnabled }
      }

      await transaction
        .insert(companyHolidayImportSettings)
        .values({ companyId: input.companyId, isEnabled: input.isEnabled })
        .onConflictDoUpdate({
          set: { isEnabled: input.isEnabled },
          target: companyHolidayImportSettings.companyId,
        })
      await appendBusinessCalendarAudit({
        action: BUSINESS_CALENDAR_AUDIT_ACTION.HOLIDAY_IMPORT_ENABLEMENT_CHANGED,
        actor: input,
        after: { isEnabled: input.isEnabled },
        before: { isEnabled: wasEnabled },
        entityId: input.companyId,
        target: BUSINESS_CALENDAR_AUDIT_TARGET.COMPANY_HOLIDAY_IMPORT_SETTINGS,
        transaction,
      })

      return { isEnabled: input.isEnabled }
    })
  }
}
