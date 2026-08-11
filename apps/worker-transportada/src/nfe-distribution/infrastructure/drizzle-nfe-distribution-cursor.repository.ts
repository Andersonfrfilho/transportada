/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { type SQL, and, eq, isNull, lte, or, sql } from 'drizzle-orm'

import { type NfeFiscalEnvironment, nfeDistributionCursors } from '../../database/nfe.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * NT 2014.002 §3.11.4.1: retomar a consulta antes de completar a hora zera a contagem da SEFAZ.
 * Por isso o salto calcula a própria janela — quem move o cursor fora de sequência nunca a esquece.
 */
const RESYNC_WINDOW_MS = 60 * 60 * 1000

type DistributionCursorRecord = {
  readonly companyId: string
  readonly consecutiveRateLimits: number
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
  readonly consecutiveRateLimits: number
  readonly environment: NfeFiscalEnvironment
  readonly maxNsu: string
  readonly nextAllowedAt: Date | null
  readonly owner: string
  readonly skipped?: {
    readonly fromNsu: string
    readonly toNsu: string
  }
  readonly ultNsu: string
}

type ResyncCursorInput = {
  readonly companyId: string
  readonly environment: NfeFiscalEnvironment
  readonly now: Date
  readonly owner: string
  readonly skippedFromNsu: string
  readonly skippedToNsu: string
  readonly ultNsu: string
}

type CursorRow = typeof nfeDistributionCursors.$inferSelect

function toRecord(row: CursorRow): DistributionCursorRecord {
  return {
    companyId: row.companyId,
    consecutiveRateLimits: row.consecutiveRateLimits,
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
    const now = new Date()
    const skipped =
      input.skipped === undefined
        ? {}
        : {
            lastSkippedAt: now,
            lastSkippedFromNsu: input.skipped.fromNsu,
            lastSkippedToNsu: input.skipped.toNsu,
          }

    await this.db
      .update(nfeDistributionCursors)
      .set({
        consecutiveRateLimits: input.consecutiveRateLimits,
        maxNsu: input.maxNsu,
        nextAllowedAt: input.nextAllowedAt,
        ultNsu: input.ultNsu,
        updatedAt: now,
        version: sql`${nfeDistributionCursors.version} + 1`,
        ...skipped,
      })
      .where(this.ownedCursor(input))
  }

  async resyncCursor(input: ResyncCursorInput): Promise<void> {
    await this.db
      .update(nfeDistributionCursors)
      .set({
        consecutiveRateLimits: 0,
        lastSkippedAt: input.now,
        lastSkippedFromNsu: input.skippedFromNsu,
        lastSkippedToNsu: input.skippedToNsu,
        nextAllowedAt: new Date(input.now.getTime() + RESYNC_WINDOW_MS),
        ultNsu: input.ultNsu,
        updatedAt: input.now,
        version: sql`${nfeDistributionCursors.version} + 1`,
      })
      .where(this.ownedCursor(input))
  }

  private ownedCursor(input: {
    readonly companyId: string
    readonly environment: NfeFiscalEnvironment
    readonly owner: string
  }): SQL | undefined {
    return and(
      eq(nfeDistributionCursors.companyId, input.companyId),
      eq(nfeDistributionCursors.environment, input.environment),
      eq(nfeDistributionCursors.leaseOwner, input.owner),
    )
  }
}
