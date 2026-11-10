/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq, sql } from 'drizzle-orm'

import { companyDriverOccurrenceEmailSettings } from '../../database/company-driver-occurrence-email-settings.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import type {
  DriverOccurrenceEmailSettings,
  DriverOccurrenceEmailSettingsPort,
  SaveDriverOccurrenceEmailSettingsParams,
} from '../application/driver-occurrence-email-settings.port.js'
import {
  COMPANY_SETTINGS_PERSISTENCE_FAILURE,
  CompanySettingsPersistenceError,
} from '../domain/company-settings-persistence.error.js'
import {
  DEFAULT_DRIVER_OCCURRENCE_EMAIL_ENABLED,
  DRIVER_OCCURRENCE_EMAIL_AUDIT_PERMISSION,
  DRIVER_OCCURRENCE_EMAIL_AUDIT_TARGET_TYPE,
  DRIVER_OCCURRENCE_EMAIL_CHANGED_ACTION,
} from '../domain/driver-occurrence-email.constant.js'
import { acquireDriverOccurrenceEmailLock } from './drizzle-company-settings.support.js'
import type {
  CompanySettingsDatabase,
  CompanySettingsTransaction,
} from './drizzle-company-settings.types.js'

type SettingsRow = typeof companyDriverOccurrenceEmailSettings.$inferSelect

const DATABASE_NOW = sql`now()`

/** Uma linha por empresa; toda instrução é filtrada pelo tenant do contexto, e os horários são do banco. */
export class DrizzleDriverOccurrenceEmailSettingsRepository
  implements DriverOccurrenceEmailSettingsPort
{
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async find(params: {
    readonly companyId: string
  }): Promise<DriverOccurrenceEmailSettings> {
    const [row] = await this.database
      .select()
      .from(companyDriverOccurrenceEmailSettings)
      .where(eq(companyDriverOccurrenceEmailSettings.companyId, params.companyId))
      .limit(1)

    return toSettings(row)
  }

  public async save(
    params: SaveDriverOccurrenceEmailSettingsParams,
  ): Promise<DriverOccurrenceEmailSettings> {
    return this.database.transaction(async (transaction) => {
      const previous = await lockRow(transaction, params.companyId)
      const previousEnabled = previous?.enabled ?? DEFAULT_DRIVER_OCCURRENCE_EMAIL_ENABLED
      if (previousEnabled === params.enabled) return toSettings(previous)

      const [row] = await transaction
        .insert(companyDriverOccurrenceEmailSettings)
        .values({
          companyId: params.companyId,
          enabled: params.enabled,
          updatedAt: DATABASE_NOW,
          updatedByUserId: params.userId,
        })
        .onConflictDoUpdate({
          set: { enabled: params.enabled, updatedAt: DATABASE_NOW, updatedByUserId: params.userId },
          target: companyDriverOccurrenceEmailSettings.companyId,
        })
        .returning()

      if (row === undefined) {
        throw new CompanySettingsPersistenceError(
          COMPANY_SETTINGS_PERSISTENCE_FAILURE.driverOccurrenceEmailNotPersisted,
        )
      }
      await appendAudit(transaction, { actor: params, after: row.enabled, before: previousEnabled })

      return toSettings(row)
    })
  }
}

/** `FOR UPDATE` não trava linha que ainda não existe: o lock por empresa serializa o primeiro PUT. */
async function lockRow(
  transaction: CompanySettingsTransaction,
  companyId: string,
): Promise<SettingsRow | undefined> {
  await acquireDriverOccurrenceEmailLock(transaction, companyId)

  return transaction
    .select()
    .from(companyDriverOccurrenceEmailSettings)
    .where(eq(companyDriverOccurrenceEmailSettings.companyId, companyId))
    .limit(1)
    .for('update')
    .then((rows) => rows[0])
}

type AuditParams = {
  readonly actor: SaveDriverOccurrenceEmailSettingsParams
  readonly after: boolean
  readonly before: boolean
}

/** Ator, empresa, valor antes e depois, IP e correlação; nenhum dado de ocorrência. */
async function appendAudit(
  transaction: CompanySettingsTransaction,
  params: AuditParams,
): Promise<void> {
  await transaction.insert(auditLogs).values({
    action: DRIVER_OCCURRENCE_EMAIL_CHANGED_ACTION,
    actorUserId: params.actor.userId,
    afterSnapshot: { enabled: params.after },
    beforeSnapshot: { enabled: params.before },
    companyId: params.actor.companyId,
    correlationId: params.actor.correlationId,
    entityId: params.actor.companyId,
    entityType: DRIVER_OCCURRENCE_EMAIL_AUDIT_TARGET_TYPE,
    metadata: { ipAddress: params.actor.ipAddress },
    permission: DRIVER_OCCURRENCE_EMAIL_AUDIT_PERMISSION,
    targetId: params.actor.companyId,
    targetType: DRIVER_OCCURRENCE_EMAIL_AUDIT_TARGET_TYPE,
  })
}

function toSettings(row: SettingsRow | undefined): DriverOccurrenceEmailSettings {
  if (row === undefined)
    return { enabled: DEFAULT_DRIVER_OCCURRENCE_EMAIL_ENABLED, updatedAt: null }

  return { enabled: row.enabled, updatedAt: row.updatedAt }
}
