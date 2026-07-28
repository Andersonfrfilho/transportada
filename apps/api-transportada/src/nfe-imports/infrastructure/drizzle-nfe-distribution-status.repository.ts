/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { nfeDistributionCursors } from '../../database/nfe.schema.js'
import type {
  NfeDistributionCursorSnapshot,
  NfeDistributionStatusReaderPort,
  NfeFiscalEnvironment,
} from '../application/nfe-import.types.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleNfeDistributionStatusRepository implements NfeDistributionStatusReaderPort {
  public constructor(private readonly database: Database) {}

  async read(input: { readonly companyId: string }): Promise<{
    readonly cursor: NfeDistributionCursorSnapshot
    readonly environment: NfeFiscalEnvironment
  } | null> {
    const [profile] = await this.database
      .select({ environment: companyFiscalProfiles.environment })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, input.companyId))
      .limit(1)
    if (profile === undefined) return null

    const [cursor] = await this.database
      .select({
        leaseExpiresAt: nfeDistributionCursors.leaseExpiresAt,
        maxNsu: nfeDistributionCursors.maxNsu,
        nextAllowedAt: nfeDistributionCursors.nextAllowedAt,
        ultNsu: nfeDistributionCursors.ultNsu,
        updatedAt: nfeDistributionCursors.updatedAt,
      })
      .from(nfeDistributionCursors)
      .where(
        and(
          eq(nfeDistributionCursors.companyId, input.companyId),
          eq(nfeDistributionCursors.environment, profile.environment),
        ),
      )
      .limit(1)

    return {
      cursor:
        cursor === undefined
          ? null
          : {
              leaseExpiresAt: cursor.leaseExpiresAt?.toISOString() ?? null,
              maxNsu: cursor.maxNsu,
              nextAllowedAt: cursor.nextAllowedAt?.toISOString() ?? null,
              ultNsu: cursor.ultNsu,
              updatedAt: cursor.updatedAt.toISOString(),
            },
      environment: profile.environment,
    }
  }
}
