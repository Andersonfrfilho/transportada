/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, sql } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import { nfeDistributionCursors, type NfeFiscalEnvironment } from '../../database/nfe.schema.js'
import { distributionCursorNotFound } from '../domain/distribution-cursor.error.js'
import type {
  DistributionCursorAuditEntry,
  DistributionCursorAuditPort,
  DistributionCursorJumpInput,
  DistributionCursorRecord,
  DistributionCursorRepositoryPort,
} from '../application/distribution-cursor.port.js'
import type { CompanySettingsDatabase } from './drizzle-company-settings.types.js'

type CursorRow = typeof nfeDistributionCursors.$inferSelect

/** NT 2014.002 §3.11.4.1: todo salto de cursor espera uma hora antes da próxima consulta. */
const JUMP_WINDOW_MS = 60 * 60 * 1000
const AUDIT_ENTITY_TYPE = 'nfe-distribution-cursor'
const AUDIT_PERMISSION = 'settings.manage'

export class DrizzleDistributionCursorRepository
  implements DistributionCursorRepositoryPort, DistributionCursorAuditPort
{
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async find(input: {
    readonly companyId: string
  }): Promise<DistributionCursorRecord | null> {
    const environment = await this.resolveEnvironment(input.companyId)
    if (environment === null) return null

    const [row] = await this.database
      .select()
      .from(nfeDistributionCursors)
      .where(this.cursorOf({ companyId: input.companyId, environment }))
      .limit(1)
    return row === undefined ? null : toRecord(row)
  }

  public async jump(input: DistributionCursorJumpInput): Promise<DistributionCursorRecord> {
    const environment = await this.resolveEnvironment(input.companyId)
    if (environment === null) throw distributionCursorNotFound()

    const [row] = await this.database
      .update(nfeDistributionCursors)
      .set({
        consecutiveRateLimits: 0,
        lastSkippedAt: input.now,
        // À direita do `set`, a coluna ainda vale o valor antigo — é o começo do intervalo pulado.
        lastSkippedFromNsu: sql`${nfeDistributionCursors.ultNsu}`,
        lastSkippedToNsu: input.ultNsu,
        nextAllowedAt: new Date(input.now.getTime() + JUMP_WINDOW_MS),
        ultNsu: input.ultNsu,
        updatedAt: input.now,
        version: sql`${nfeDistributionCursors.version} + 1`,
      })
      .where(this.cursorOf({ companyId: input.companyId, environment }))
      .returning()

    if (row === undefined) throw distributionCursorNotFound()
    return toRecord(row)
  }

  public async append(entry: DistributionCursorAuditEntry): Promise<void> {
    await this.database.insert(auditLogs).values({
      action: entry.action,
      actorUserId: entry.actorUserId,
      companyId: entry.companyId,
      correlationId: entry.correlationId,
      entityId: entry.companyId,
      entityType: AUDIT_ENTITY_TYPE,
      metadata: { fromUltNsu: entry.fromUltNsu, toUltNsu: entry.toUltNsu },
      permission: AUDIT_PERMISSION,
      targetId: entry.companyId,
      targetType: AUDIT_ENTITY_TYPE,
    })
  }

  private async resolveEnvironment(companyId: string): Promise<NfeFiscalEnvironment | null> {
    const [profile] = await this.database
      .select({ environment: companyFiscalProfiles.environment })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, companyId))
      .limit(1)
    return profile?.environment ?? null
  }

  private cursorOf(input: {
    readonly companyId: string
    readonly environment: NfeFiscalEnvironment
  }) {
    return and(
      eq(nfeDistributionCursors.companyId, input.companyId),
      eq(nfeDistributionCursors.environment, input.environment),
    )
  }
}

function toRecord(row: CursorRow): DistributionCursorRecord {
  return {
    companyId: row.companyId,
    consecutiveRateLimits: row.consecutiveRateLimits,
    environment: row.environment,
    lastSkipped:
      row.lastSkippedAt === null || row.lastSkippedFromNsu === null || row.lastSkippedToNsu === null
        ? undefined
        : { at: row.lastSkippedAt, fromNsu: row.lastSkippedFromNsu, toNsu: row.lastSkippedToNsu },
    maxNsu: row.maxNsu,
    nextAllowedAt: row.nextAllowedAt ?? undefined,
    ultNsu: row.ultNsu,
    updatedAt: row.updatedAt,
  }
}
