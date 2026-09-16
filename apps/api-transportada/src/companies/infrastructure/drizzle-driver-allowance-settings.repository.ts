/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq } from 'drizzle-orm'

import { companyDriverAllowanceSettings } from '../../database/company-driver-allowance-settings.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import type {
  DriverAllowanceAuditEntry,
  DriverAllowanceSettings,
  DriverAllowanceSettingsPort,
} from '../application/driver-allowance-settings.port.js'
import type { CompanySettingsDatabase } from './drizzle-company-settings.types.js'

type SettingsRow = typeof companyDriverAllowanceSettings.$inferSelect

const AUDIT_ENTITY_TYPE = 'company-driver-allowance-settings'
const AUDIT_PERMISSION = 'settings.manage'

/**
 * Uma linha por empresa (`companyId` é a chave primária), e toda instrução filtrada pelo tenant do
 * contexto — `test/companies/driver-allowance-settings.contract.ts` confere isso no fonte.
 */
export class DrizzleDriverAllowanceSettingsRepository implements DriverAllowanceSettingsPort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async find(input: {
    readonly companyId: string
  }): Promise<DriverAllowanceSettings | null> {
    const [row] = await this.database
      .select()
      .from(companyDriverAllowanceSettings)
      .where(eq(companyDriverAllowanceSettings.companyId, input.companyId))
      .limit(1)

    return row === undefined ? null : toSettings(row)
  }

  public async upsert(input: {
    readonly amount: string
    readonly companyId: string
    readonly updatedByUserId: string
  }): Promise<DriverAllowanceSettings> {
    const now = new Date()
    const [row] = await this.database
      .insert(companyDriverAllowanceSettings)
      .values({
        companyId: input.companyId,
        dailyAllowanceAmount: input.amount,
        updatedByUserId: input.updatedByUserId,
      })
      .onConflictDoUpdate({
        set: {
          dailyAllowanceAmount: input.amount,
          updatedAt: now,
          updatedByUserId: input.updatedByUserId,
        },
        target: companyDriverAllowanceSettings.companyId,
      })
      .returning()

    if (row === undefined) {
      throw new Error('COMPANY_DRIVER_ALLOWANCE_SETTINGS_UPSERT_RETURNED_NOTHING')
    }
    return toSettings(row)
  }

  public async remove(input: { readonly companyId: string }): Promise<void> {
    await this.database
      .delete(companyDriverAllowanceSettings)
      .where(eq(companyDriverAllowanceSettings.companyId, input.companyId))
  }

  public async appendAudit(entry: DriverAllowanceAuditEntry): Promise<void> {
    await this.database.insert(auditLogs).values({
      action: entry.action,
      actorUserId: entry.actorUserId,
      companyId: entry.companyId,
      correlationId: entry.correlationId,
      entityId: entry.companyId,
      entityType: AUDIT_ENTITY_TYPE,
      metadata: { after: entry.after, before: entry.before },
      permission: AUDIT_PERMISSION,
      targetId: entry.companyId,
      targetType: AUDIT_ENTITY_TYPE,
    })
  }
}

function toSettings(row: SettingsRow): DriverAllowanceSettings {
  return {
    amount: row.dailyAllowanceAmount,
    updatedAt: row.updatedAt,
  }
}
