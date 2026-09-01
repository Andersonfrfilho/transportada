/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, sql } from 'drizzle-orm'

import { companyCargoSettings } from '../../database/company-cargo-settings.schema.js'
import type { CargoSettings, CargoSettingsPort } from '../application/cargo-settings.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleCargoSettingsRepository implements CargoSettingsPort {
  public constructor(private readonly database: Database) {}

  public async clearDefaultVolumeWeight({
    companyId,
  }: {
    readonly companyId: string
  }): Promise<void> {
    await this.database
      .update(companyCargoSettings)
      .set({ defaultVolumeWeight: null, updatedAt: new Date() })
      .where(eq(companyCargoSettings.companyId, companyId))
  }

  public async load({ companyId }: { readonly companyId: string }): Promise<CargoSettings> {
    const [row] = await this.database
      .select({ defaultVolumeWeight: companyCargoSettings.defaultVolumeWeight })
      .from(companyCargoSettings)
      .where(eq(companyCargoSettings.companyId, companyId))
      .limit(1)

    return { defaultVolumeWeight: row?.defaultVolumeWeight ?? null }
  }

  public async saveDefaultVolumeWeight({
    companyId,
    defaultVolumeWeight,
  }: {
    readonly companyId: string
    readonly defaultVolumeWeight: string
  }): Promise<void> {
    await this.database
      .insert(companyCargoSettings)
      .values({ companyId, defaultVolumeWeight })
      .onConflictDoUpdate({
        set: { defaultVolumeWeight, updatedAt: sql`now()` },
        target: companyCargoSettings.companyId,
      })
  }
}
