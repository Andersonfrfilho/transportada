/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, sql } from 'drizzle-orm'

import { companyDriverReminderSettings } from '../../database/company-driver-reminder-settings.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import type {
  DriverStopReminderSettingsPort,
  DriverStopReminderStoredSettings,
  SaveDriverStopReminderSettingsParams,
} from '../application/driver-stop-reminder-settings.port.js'
import {
  DRIVER_STOP_REMINDER_DEFAULT_COMPANY_SETTINGS,
  DRIVER_STOP_REMINDER_SETTINGS_AUDIT,
} from '../domain/driver-stop-reminder.constant.js'
import type {
  OperatingHoursRange,
  StopReminderCompanySettings,
} from '../domain/driver-stop-reminder.types.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type SettingsRow = typeof companyDriverReminderSettings.$inferSelect

const SETTINGS_LOCK_NAMESPACE = 'driver-stop-reminder-settings'

/** Uma linha por empresa; toda instrução é filtrada pelo tenant do contexto. */
export class DrizzleDriverStopReminderSettingsRepository implements DriverStopReminderSettingsPort {
  public constructor(private readonly database: Database) {}

  public async find(params: {
    readonly companyId: string
  }): Promise<DriverStopReminderStoredSettings> {
    const [row] = await this.database
      .select()
      .from(companyDriverReminderSettings)
      .where(eq(companyDriverReminderSettings.companyId, params.companyId))
      .limit(1)
    return toStored(row)
  }

  public async save(
    params: SaveDriverStopReminderSettingsParams,
  ): Promise<DriverStopReminderStoredSettings> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${SETTINGS_LOCK_NAMESPACE}:${params.companyId}`}, 0))`,
      )
      const [previousRow] = await transaction
        .select()
        .from(companyDriverReminderSettings)
        .where(eq(companyDriverReminderSettings.companyId, params.companyId))
        .limit(1)
      const previous = toStored(previousRow)
      if (previousRow !== undefined && isSameSettings(previous.settings, params)) return previous

      const values = {
        dwellMinutes: params.dwellMinutes,
        enabled: params.enabled,
        graceMinMinutes: params.graceMinMinutes,
        gracePercent: params.gracePercent,
        intervalMinutes: params.intervalMinutes,
        maxAttempts: params.maxAttempts,
        operatingHours: params.operatingHours,
        updatedAt: sql`now()`,
      }
      const [row] = await transaction
        .insert(companyDriverReminderSettings)
        .values({ companyId: params.companyId, ...values })
        .onConflictDoUpdate({ set: values, target: companyDriverReminderSettings.companyId })
        .returning()
      if (row === undefined) throw new Error('DRIVER_STOP_REMINDER_SETTINGS_NOT_PERSISTED')
      const saved = toStored(row)
      await appendAudit(transaction, {
        actor: params,
        after: saved.settings,
        before: previous.settings,
      })
      return saved
    })
  }
}

function isSameSettings(
  left: StopReminderCompanySettings,
  right: StopReminderCompanySettings,
): boolean {
  return JSON.stringify(toSnapshot(left)) === JSON.stringify(toSnapshot(right))
}

/** Ordem fixa dos campos e das faixas: o mesmo conteúdo compara igual e audita igual. */
function toSnapshot(settings: StopReminderCompanySettings): StopReminderCompanySettings {
  return {
    dwellMinutes: settings.dwellMinutes,
    enabled: settings.enabled,
    graceMinMinutes: settings.graceMinMinutes,
    gracePercent: settings.gracePercent,
    intervalMinutes: settings.intervalMinutes,
    maxAttempts: settings.maxAttempts,
    operatingHours: settings.operatingHours.map((range) => ({
      end: range.end,
      start: range.start,
      weekday: range.weekday,
    })),
  }
}

function toStored(row: SettingsRow | undefined): DriverStopReminderStoredSettings {
  if (row === undefined) {
    return { settings: DRIVER_STOP_REMINDER_DEFAULT_COMPANY_SETTINGS, updatedAt: null }
  }
  return {
    settings: toSnapshot({
      ...row,
      operatingHours: row.operatingHours as readonly OperatingHoursRange[],
    }),
    updatedAt: row.updatedAt,
  }
}

type AuditParams = {
  readonly actor: SaveDriverStopReminderSettingsParams
  readonly after: StopReminderCompanySettings
  readonly before: StopReminderCompanySettings
}

/** Ator, empresa, antes e depois, IP e correlação; configuração da empresa, sem dado pessoal. */
async function appendAudit(transaction: Transaction, params: AuditParams): Promise<void> {
  await transaction.insert(auditLogs).values({
    action: DRIVER_STOP_REMINDER_SETTINGS_AUDIT.ACTION,
    actorUserId: params.actor.userId,
    afterSnapshot: toSnapshot(params.after),
    beforeSnapshot: toSnapshot(params.before),
    companyId: params.actor.companyId,
    correlationId: params.actor.correlationId,
    entityId: params.actor.companyId,
    entityType: DRIVER_STOP_REMINDER_SETTINGS_AUDIT.TARGET,
    metadata: { ipAddress: params.actor.ipAddress },
    permission: DRIVER_STOP_REMINDER_SETTINGS_AUDIT.PERMISSION,
    targetId: params.actor.companyId,
    targetType: DRIVER_STOP_REMINDER_SETTINGS_AUDIT.TARGET,
  })
}
