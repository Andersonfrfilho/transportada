/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq } from 'drizzle-orm'

import { companyLocationRetentionSettings } from '../../database/company-location-retention-settings.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import type {
  LocationRetentionActor,
  LocationRetentionImpactEntry,
  LocationRetentionSettings,
  LocationRetentionSettingsPort,
  SaveLocationRetentionSettingsInput,
} from '../application/location-retention-settings.port.js'
import {
  LOCATION_RETENTION_AUDIT_PERMISSION,
  LOCATION_RETENTION_AUDIT_TARGET_TYPE,
  LOCATION_RETENTION_CLEARED_ACTION,
  LOCATION_RETENTION_SAVED_ACTION,
} from '../domain/location-retention.constant.js'
import { resolvePurgeEffectiveAt } from '../domain/location-retention.policy.js'
import type {
  CompanySettingsDatabase,
  CompanySettingsTransaction,
} from './drizzle-company-settings.types.js'
import { countLocationRetentionImpact } from './drizzle-location-retention-impact.query.js'

type SettingsRow = typeof companyLocationRetentionSettings.$inferSelect
/**
 * Uma linha por empresa (`companyId` é a chave primária), e toda instrução filtrada pelo tenant do
 * contexto — `test/companies/location-retention-settings.contract.ts` confere isso no fonte.
 */
export class DrizzleLocationRetentionSettingsRepository implements LocationRetentionSettingsPort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async find(input: {
    readonly companyId: string
  }): Promise<LocationRetentionSettings | null> {
    const [row] = await this.database
      .select()
      .from(companyLocationRetentionSettings)
      .where(eq(companyLocationRetentionSettings.companyId, input.companyId))
      .limit(1)

    return row === undefined ? null : toSettings(row)
  }

  public async save(input: SaveLocationRetentionSettingsInput): Promise<LocationRetentionSettings> {
    return this.database.transaction(async (transaction) => {
      const previous = await lockRow(transaction, input.companyId)
      const purgeEffectiveAt = resolvePurgeEffectiveAt({
        next: input.next,
        now: input.now,
        previous:
          previous === undefined
            ? null
            : {
                purgeEffectiveAt: previous.purgeEffectiveAt ?? input.now,
                purgeEnabled: previous.purgeEnabled,
                retentionDays: previous.retentionDays,
              },
      })
      const [row] = await transaction
        .insert(companyLocationRetentionSettings)
        .values({
          companyId: input.companyId,
          purgeEffectiveAt,
          purgeEnabled: input.next.purgeEnabled,
          retentionDays: input.next.retentionDays,
          updatedAt: input.now,
          updatedByUserId: input.userId,
        })
        .onConflictDoUpdate({
          set: {
            purgeEffectiveAt,
            purgeEnabled: input.next.purgeEnabled,
            retentionDays: input.next.retentionDays,
            updatedAt: input.now,
            updatedByUserId: input.userId,
          },
          target: companyLocationRetentionSettings.companyId,
        })
        .returning()

      if (row === undefined) {
        throw new Error('COMPANY_LOCATION_RETENTION_SETTINGS_UPSERT_RETURNED_NOTHING')
      }
      await appendAudit(transaction, {
        action: LOCATION_RETENTION_SAVED_ACTION,
        actor: input,
        after: toSnapshot(row),
        before: previous === undefined ? null : toSnapshot(previous),
        metadata: { affectedEstimate: input.affectedEstimate },
      })

      return toSettings(row)
    })
  }

  public async clear(input: LocationRetentionActor): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const previous = await lockRow(transaction, input.companyId)
      if (previous === undefined) return

      await transaction
        .delete(companyLocationRetentionSettings)
        .where(eq(companyLocationRetentionSettings.companyId, input.companyId))
      await appendAudit(transaction, {
        action: LOCATION_RETENTION_CLEARED_ACTION,
        actor: input,
        after: null,
        before: toSnapshot(previous),
        metadata: {},
      })
    })
  }

  public countImpact(input: {
    readonly companyId: string
    readonly now: Date
    readonly retentionDays: number
  }): Promise<readonly LocationRetentionImpactEntry[]> {
    return countLocationRetentionImpact(this.database, input)
  }
}

function lockRow(
  transaction: CompanySettingsTransaction,
  companyId: string,
): Promise<SettingsRow | undefined> {
  return transaction
    .select()
    .from(companyLocationRetentionSettings)
    .where(eq(companyLocationRetentionSettings.companyId, companyId))
    .limit(1)
    .for('update')
    .then((rows) => rows[0])
}

type AuditParams = {
  readonly action: string
  readonly actor: LocationRetentionActor
  readonly after: Snapshot | null
  readonly before: Snapshot | null
  readonly metadata: Record<string, unknown>
}

type Snapshot = {
  readonly purgeEffectiveAt: string | null
  readonly purgeEnabled: boolean
  readonly retentionDays: number
}

/** Ator, empresa-alvo, antes/depois e IP; nenhuma coordenada, id de evento ou nome. */
async function appendAudit(
  transaction: CompanySettingsTransaction,
  params: AuditParams,
): Promise<void> {
  await transaction.insert(auditLogs).values({
    action: params.action,
    actorUserId: params.actor.userId,
    afterSnapshot: params.after,
    beforeSnapshot: params.before,
    companyId: params.actor.companyId,
    correlationId: params.actor.correlationId,
    entityId: params.actor.companyId,
    entityType: LOCATION_RETENTION_AUDIT_TARGET_TYPE,
    metadata: { ipAddress: params.actor.ipAddress, ...params.metadata },
    permission: LOCATION_RETENTION_AUDIT_PERMISSION,
    targetId: params.actor.companyId,
    targetType: LOCATION_RETENTION_AUDIT_TARGET_TYPE,
  })
}

function toSnapshot(row: SettingsRow): Snapshot {
  return {
    purgeEffectiveAt: row.purgeEffectiveAt?.toISOString() ?? null,
    purgeEnabled: row.purgeEnabled,
    retentionDays: row.retentionDays,
  }
}

function toSettings(row: SettingsRow): LocationRetentionSettings {
  return {
    purgeEffectiveAt: row.purgeEffectiveAt,
    purgeEnabled: row.purgeEnabled,
    retentionDays: row.retentionDays,
    updatedAt: row.updatedAt,
  }
}
