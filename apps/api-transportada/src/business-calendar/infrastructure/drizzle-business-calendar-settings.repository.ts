/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq } from 'drizzle-orm'

import { companyBusinessCalendarSettings } from '../../database/company-business-calendar-settings.schema.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type {
  BusinessCalendarSettingsPort,
  BusinessCalendarSettingsRecord,
} from '../application/business-calendar-settings.port.js'
import {
  BUSINESS_CALENDAR_AUDIT_ACTION,
  BUSINESS_CALENDAR_AUDIT_TARGET,
} from '../domain/business-calendar-audit.constant.js'
import { appendBusinessCalendarAudit } from './business-calendar-audit.support.js'
import type { BusinessCalendarDatabase } from './business-calendar-database.types.js'
import { acquireBusinessCalendarLock } from './business-calendar-lock.support.js'
import { requirePersistedRow } from './business-calendar-persistence.support.js'

type SettingsRow = typeof companyBusinessCalendarSettings.$inferSelect

/** Uma linha por empresa (`companyId` é a chave primária); toda instrução filtra pela empresa do contexto. */
export class DrizzleBusinessCalendarSettingsRepository implements BusinessCalendarSettingsPort {
  public constructor(private readonly database: BusinessCalendarDatabase) {}

  public async find(input: {
    readonly companyId: string
  }): Promise<BusinessCalendarSettingsRecord | null> {
    const [row] = await this.database
      .select()
      .from(companyBusinessCalendarSettings)
      .where(eq(companyBusinessCalendarSettings.companyId, input.companyId))
      .limit(1)

    return row === undefined ? null : toRecord(row)
  }

  public async save(
    input: BusinessCalendarActor & { readonly saturdayIsBusinessDay: boolean },
  ): Promise<BusinessCalendarSettingsRecord> {
    return this.database.transaction(async (transaction) => {
      await acquireBusinessCalendarLock({ companyId: input.companyId, transaction })
      const [previous] = await transaction
        .select()
        .from(companyBusinessCalendarSettings)
        .where(eq(companyBusinessCalendarSettings.companyId, input.companyId))
        .limit(1)
      const values = {
        saturdayIsBusinessDay: input.saturdayIsBusinessDay,
        updatedAt: new Date(),
        updatedByUserId: input.userId,
      }
      const row = requirePersistedRow(
        (
          await transaction
            .insert(companyBusinessCalendarSettings)
            .values({ companyId: input.companyId, ...values })
            .onConflictDoUpdate({ set: values, target: companyBusinessCalendarSettings.companyId })
            .returning()
        )[0],
      )
      await appendBusinessCalendarAudit({
        action: BUSINESS_CALENDAR_AUDIT_ACTION.SETTINGS_SAVED,
        actor: input,
        after: toSnapshot(row),
        before: previous === undefined ? null : toSnapshot(previous),
        entityId: input.companyId,
        target: BUSINESS_CALENDAR_AUDIT_TARGET.SETTINGS,
        transaction,
      })

      return toRecord(row)
    })
  }
}

function toSnapshot(row: SettingsRow): { readonly saturdayIsBusinessDay: boolean } {
  return { saturdayIsBusinessDay: row.saturdayIsBusinessDay }
}

function toRecord(row: SettingsRow): BusinessCalendarSettingsRecord {
  return { saturdayIsBusinessDay: row.saturdayIsBusinessDay, updatedAt: row.updatedAt }
}
