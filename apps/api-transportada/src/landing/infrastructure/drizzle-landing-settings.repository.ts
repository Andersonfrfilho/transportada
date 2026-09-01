/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { landingSettings } from '../../database/database.schema.js'
import type {
  LandingSettingsRecord,
  LandingSettingsRepositoryPort,
  LandingSettingsWriteInput,
} from '../application/landing-settings.port.js'

export type LandingSettingsDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleLandingSettingsRepository(
  database: LandingSettingsDatabase,
): LandingSettingsRepositoryPort {
  return {
    async findByRoot({ cnpjRoot }) {
      const [row] = await database
        .select()
        .from(landingSettings)
        .where(eq(landingSettings.cnpjRoot, cnpjRoot))
        .limit(1)

      return row === undefined ? null : toRecord(row)
    },

    async upsert(input: LandingSettingsWriteInput) {
      const [row] = await database
        .insert(landingSettings)
        .values({
          accentColor: input.accentColor ?? null,
          brandName: input.brandName ?? null,
          cnpjRoot: input.cnpjRoot,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          sections: input.sections,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          set: {
            accentColor: input.accentColor ?? null,
            brandName: input.brandName ?? null,
            contactEmail: input.contactEmail ?? null,
            contactPhone: input.contactPhone ?? null,
            sections: input.sections,
            updatedAt: new Date(),
          },
          target: landingSettings.cnpjRoot,
        })
        .returning()

      if (row === undefined) {
        throw new Error('landing settings upsert returned no row')
      }
      return toRecord(row)
    },
  }
}

function toRecord(row: typeof landingSettings.$inferSelect): LandingSettingsRecord {
  return {
    accentColor: row.accentColor ?? undefined,
    brandName: row.brandName ?? undefined,
    contactEmail: row.contactEmail ?? undefined,
    contactPhone: row.contactPhone ?? undefined,
    sections: row.sections as LandingSettingsRecord['sections'],
    updatedAt: row.updatedAt,
  }
}
