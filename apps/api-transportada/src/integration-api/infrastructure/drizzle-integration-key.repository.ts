/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, isNull, lt, or } from 'drizzle-orm'

import { auditLogs } from '../../database/database.schema.js'
import { integrationApiKeys } from '../../database/integration-api-key.schema.js'
import type {
  IntegrationKeyAuditEntry,
  IntegrationKeyRecord,
  IntegrationKeyRepositoryPort,
} from '../application/integration-key.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Row = typeof integrationApiKeys.$inferSelect

const TOUCH_INTERVAL_MS = 60_000
const AUDIT_ENTITY_TYPE = 'integration-api-key'

export class DrizzleIntegrationKeyRepository implements IntegrationKeyRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async create(
    input: Parameters<IntegrationKeyRepositoryPort['create']>[0],
  ): Promise<IntegrationKeyRecord> {
    const [row] = await this.database
      .insert(integrationApiKeys)
      .values({
        companyId: input.companyId,
        createdByUserId: input.createdByUserId,
        keyHash: input.keyHash,
        keyPrefix: input.keyPrefix,
        name: input.name,
        scopes: [...input.scopes],
      })
      .returning()
    if (row === undefined) throw new Error('INTEGRATION_KEY_INSERT_RETURNED_NOTHING')
    return toRecord(row)
  }

  public async list(input: {
    readonly companyId: string
  }): Promise<readonly IntegrationKeyRecord[]> {
    const rows = await this.database
      .select()
      .from(integrationApiKeys)
      .where(eq(integrationApiKeys.companyId, input.companyId))
      .orderBy(desc(integrationApiKeys.createdAt))
      .limit(100)
    return rows.map(toRecord)
  }

  public async revoke(input: {
    readonly companyId: string
    readonly id: string
    readonly now: Date
  }): Promise<IntegrationKeyRecord | null> {
    const [row] = await this.database
      .update(integrationApiKeys)
      .set({ revokedAt: input.now })
      .where(
        and(
          eq(integrationApiKeys.companyId, input.companyId),
          eq(integrationApiKeys.id, input.id),
          isNull(integrationApiKeys.revokedAt),
        ),
      )
      .returning()
    return row === undefined ? null : toRecord(row)
  }

  public async findActiveByHash(input: {
    readonly keyHash: string
    readonly now: Date
  }): Promise<IntegrationKeyRecord | null> {
    const [row] = await this.database
      .select()
      .from(integrationApiKeys)
      .where(
        and(eq(integrationApiKeys.keyHash, input.keyHash), isNull(integrationApiKeys.revokedAt)),
      )
      .limit(1)
    if (row === undefined) return null
    const stale = new Date(input.now.getTime() - TOUCH_INTERVAL_MS)
    // Escrita condicional: sob rajada só uma chamada por minuto grava, e as demais seguem só lendo.
    await this.database
      .update(integrationApiKeys)
      .set({ lastUsedAt: input.now })
      .where(
        and(
          eq(integrationApiKeys.id, row.id),
          or(isNull(integrationApiKeys.lastUsedAt), lt(integrationApiKeys.lastUsedAt, stale)),
        ),
      )
    return toRecord(row)
  }

  public async appendAudit(entry: IntegrationKeyAuditEntry): Promise<void> {
    await this.database.insert(auditLogs).values({
      action: entry.action,
      actorUserId: entry.actorUserId,
      companyId: entry.companyId,
      correlationId: entry.correlationId,
      entityId: entry.keyId,
      entityType: AUDIT_ENTITY_TYPE,
      metadata: { after: entry.after, before: entry.before },
      permission: 'settings.manage',
      targetId: entry.keyId,
      targetType: AUDIT_ENTITY_TYPE,
    })
  }
}

function toRecord(row: Row): IntegrationKeyRecord {
  return {
    companyId: row.companyId,
    createdAt: row.createdAt,
    createdByUserId: row.createdByUserId,
    id: row.id,
    keyPrefix: row.keyPrefix,
    lastUsedAt: row.lastUsedAt,
    name: row.name,
    revokedAt: row.revokedAt,
    scopes: row.scopes,
  }
}
