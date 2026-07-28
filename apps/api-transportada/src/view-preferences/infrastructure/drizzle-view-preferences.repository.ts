/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import { viewPreferences } from '../../database/database.schema.js'
import type {
  ViewPreferencesReaderPort,
  ViewPreferencesRecord,
  ViewPreferencesWriterPort,
} from '../application/view-preferences.port.js'

type ViewPreferencesDatabase = ReturnType<typeof createDrizzleProvider>['db']

type ViewPreferencesRow = {
  readonly preferences: Record<string, unknown>
  readonly updatedAt: Date
}

export class DrizzleViewPreferencesRepository
  implements ViewPreferencesReaderPort, ViewPreferencesWriterPort
{
  public constructor(private readonly database: ViewPreferencesDatabase) {}

  public async find(input: {
    readonly companyId: string
    readonly userId: string
    readonly viewKey: string
  }): Promise<ViewPreferencesRecord | null> {
    const [row] = await this.database
      .select({ preferences: viewPreferences.preferences, updatedAt: viewPreferences.updatedAt })
      .from(viewPreferences)
      .where(
        and(
          eq(viewPreferences.companyId, input.companyId),
          eq(viewPreferences.userId, input.userId),
          eq(viewPreferences.viewKey, input.viewKey),
        ),
      )
      .limit(1)

    return row === undefined ? null : toRecord(row)
  }

  public async save(input: {
    readonly companyId: string
    readonly preferences: Record<string, unknown>
    readonly userId: string
    readonly viewKey: string
  }): Promise<ViewPreferencesRecord> {
    const [row] = await this.database
      .insert(viewPreferences)
      .values({
        companyId: input.companyId,
        preferences: input.preferences,
        userId: input.userId,
        viewKey: input.viewKey,
      })
      .onConflictDoUpdate({
        set: { preferences: input.preferences, updatedAt: sql`now()` },
        target: [viewPreferences.companyId, viewPreferences.userId, viewPreferences.viewKey],
      })
      .returning({
        preferences: viewPreferences.preferences,
        updatedAt: viewPreferences.updatedAt,
      })

    if (row === undefined) {
      throw new Error('view_preferences upsert did not return a row')
    }
    return toRecord(row)
  }
}

function toRecord(row: ViewPreferencesRow): ViewPreferencesRecord {
  return { preferences: row.preferences, updatedAt: row.updatedAt.toISOString() }
}
