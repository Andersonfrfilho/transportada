/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm'

import { type NfeFiscalEnvironment, nfeDistributionCursors } from '../../database/nfe.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type DistributionCursorRecord = {
  readonly companyId: string
  readonly environment: NfeFiscalEnvironment
  readonly leaseExpiresAt: Date | null
  readonly leaseOwner: string | null
  readonly maxNsu: string
  readonly nextAllowedAt: Date | null
  readonly ultNsu: string
  readonly version: bigint
}

type AcquireLeaseInput = {
  readonly companyId: string
  readonly environment: NfeFiscalEnvironment
  readonly leaseMs: number
  readonly now: Date
  readonly owner: string
}

type ReleaseLeaseInput = {
  readonly companyId: string
  readonly environment: NfeFiscalEnvironment
  readonly owner: string
}

type SaveCursorInput = {
  readonly companyId: string
  readonly environment: NfeFiscalEnvironment
  readonly maxNsu: string
  readonly nextAllowedAt: Date | null
  readonly owner: string
  readonly ultNsu: string
}

type CursorRow = typeof nfeDistributionCursors.$inferSelect

function toRecord(row: CursorRow): DistributionCursorRecord {
  return {
    companyId: row.companyId,
    environment: row.environment,
    leaseExpiresAt: row.leaseExpiresAt,
    leaseOwner: row.leaseOwner,
    maxNsu: row.maxNsu,
    nextAllowedAt: row.nextAllowedAt,
    ultNsu: row.ultNsu,
    version: row.version,
  }
}

export class DrizzleNfeDistributionCursorRepository {
  constructor(private readonly db: Database) {}

  async acquireLease(input: AcquireLeaseInput): Promise<DistributionCursorRecord | null> {
    const leaseExpiresAt = new Date(input.now.getTime() + input.leaseMs)

    return this.db.transaction(async (tx) => {
      await tx
        .insert(nfeDistributionCursors)
        .values({ companyId: input.companyId, environment: input.environment })
        .onConflictDoNothing()

      const rows = await tx
        .update(nfeDistributionCursors)
        .set({
          leaseExpiresAt,
          leaseOwner: input.owner,
          updatedAt: input.now,
          version: sql`${nfeDistributionCursors.version} + 1`,
        })
        .where(
          and(
            eq(nfeDistributionCursors.companyId, input.companyId),
            eq(nfeDistributionCursors.environment, input.environment),
            or(
              isNull(nfeDistributionCursors.leaseOwner),
              lte(nfeDistributionCursors.leaseExpiresAt, input.now),
            ),
          ),
        )
        .returning()

      const row = rows[0]
      return row === undefined ? null : toRecord(row)
    })
  }

  async releaseLease(input: ReleaseLeaseInput): Promise<void> {
    await this.db
      .update(nfeDistributionCursors)
      .set({ leaseExpiresAt: null, leaseOwner: null, updatedAt: new Date() })
      .where(
        and(
          eq(nfeDistributionCursors.companyId, input.companyId),
          eq(nfeDistributionCursors.environment, input.environment),
          eq(nfeDistributionCursors.leaseOwner, input.owner),
        ),
      )
  }

  async saveCursor(input: SaveCursorInput): Promise<void> {
    await this.db
      .update(nfeDistributionCursors)
      .set({
        maxNsu: input.maxNsu,
        nextAllowedAt: input.nextAllowedAt,
        ultNsu: input.ultNsu,
        updatedAt: new Date(),
        version: sql`${nfeDistributionCursors.version} + 1`,
      })
      .where(
        and(
          eq(nfeDistributionCursors.companyId, input.companyId),
          eq(nfeDistributionCursors.environment, input.environment),
          eq(nfeDistributionCursors.leaseOwner, input.owner),
        ),
      )
  }
}
