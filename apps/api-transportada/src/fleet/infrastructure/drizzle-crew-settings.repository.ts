/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, sql } from 'drizzle-orm'

import { companyCrewSettings } from '../../database/company-crew-settings.schema.js'
import type { CrewSettings, CrewSettingsPort } from '../application/crew-settings.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleCrewSettingsRepository implements CrewSettingsPort {
  public constructor(private readonly database: Database) {}

  public async load({ companyId }: { readonly companyId: string }): Promise<CrewSettings> {
    const [row] = await this.database
      .select({ helperDailyRate: companyCrewSettings.helperDailyRate })
      .from(companyCrewSettings)
      .where(eq(companyCrewSettings.companyId, companyId))
      .limit(1)

    return { helperDailyRate: row?.helperDailyRate ?? null }
  }

  public async save({
    companyId,
    helperDailyRate,
  }: {
    readonly companyId: string
    readonly helperDailyRate: string | null
  }): Promise<void> {
    await this.database
      .insert(companyCrewSettings)
      .values({ companyId, helperDailyRate })
      .onConflictDoUpdate({
        set: { helperDailyRate, updatedAt: sql`now()` },
        target: companyCrewSettings.companyId,
      })
  }
}
