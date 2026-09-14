/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq } from 'drizzle-orm'

import { auditLogs } from '../../database/fiscal-operation.schema.js'
import { companyTaxSettings } from '../../database/trip-financial.schema.js'
import type {
  FederalTaxAuditEntry,
  FederalTaxRates,
  FederalTaxSettings,
  FederalTaxSettingsPort,
} from '../application/federal-tax-settings.port.js'
import type { CompanySettingsDatabase } from './drizzle-company-settings.types.js'

type TaxRow = typeof companyTaxSettings.$inferSelect

const AUDIT_ENTITY_TYPE = 'company-tax-settings'
const AUDIT_PERMISSION = 'settings.manage'

/**
 * Uma linha por empresa (`company_tax_settings_company_unique`), e toda instrução filtrada pelo
 * tenant do contexto — `test/companies/federal-tax-settings.contract.ts` confere isso no fonte.
 */
export class DrizzleFederalTaxSettingsRepository implements FederalTaxSettingsPort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async find(input: { readonly companyId: string }): Promise<FederalTaxSettings | null> {
    const [row] = await this.database
      .select()
      .from(companyTaxSettings)
      .where(eq(companyTaxSettings.companyId, input.companyId))
      .limit(1)

    return row === undefined ? null : toSettings(row)
  }

  public async upsert(
    input: FederalTaxRates & { readonly companyId: string; readonly updatedByUserId: string },
  ): Promise<FederalTaxSettings> {
    const now = new Date()
    const rates = {
      cofinsRate: input.cofinsRate,
      federalRegime: input.federalRegime,
      pisRate: input.pisRate,
      updatedByUserId: input.updatedByUserId,
    }
    const [row] = await this.database
      .insert(companyTaxSettings)
      .values({ ...rates, companyId: input.companyId })
      .onConflictDoUpdate({
        set: { ...rates, updatedAt: now },
        target: companyTaxSettings.companyId,
      })
      .returning()

    if (row === undefined) throw new Error('COMPANY_TAX_SETTINGS_UPSERT_RETURNED_NOTHING')
    return toSettings(row)
  }

  public async remove(input: { readonly companyId: string }): Promise<void> {
    await this.database
      .delete(companyTaxSettings)
      .where(eq(companyTaxSettings.companyId, input.companyId))
  }

  public async appendAudit(entry: FederalTaxAuditEntry): Promise<void> {
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

function toSettings(row: TaxRow): FederalTaxSettings {
  return {
    cofinsRate: row.cofinsRate,
    federalRegime: row.federalRegime,
    pisRate: row.pisRate,
    updatedAt: row.updatedAt,
  }
}
