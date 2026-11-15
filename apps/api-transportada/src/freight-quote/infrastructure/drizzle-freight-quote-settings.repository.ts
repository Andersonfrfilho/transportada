/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq } from 'drizzle-orm'

import { companyFreightQuoteSettings } from '../../database/company-freight-quote-settings.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import type { CompanySettingsDatabase } from '../../companies/infrastructure/drizzle-company-settings.types.js'
import type {
  FreightQuoteSettingsAuditEntry,
  FreightQuoteSettingsPort,
  FreightQuoteSettingsRecord,
} from '../application/freight-quote-settings.port.js'
import type { FreightQuoteSettingsValues } from '../domain/freight-quote.policy.js'

type SettingsRow = typeof companyFreightQuoteSettings.$inferSelect

const AUDIT_ENTITY_TYPE = 'company-freight-quote-settings'
const AUDIT_PERMISSION = 'settings.manage'

/** Uma linha por empresa (`companyId` é a chave primária); toda instrução filtra pelo tenant do contexto. */
export class DrizzleFreightQuoteSettingsRepository implements FreightQuoteSettingsPort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async find(input: {
    readonly companyId: string
  }): Promise<FreightQuoteSettingsRecord | null> {
    const [row] = await this.database
      .select()
      .from(companyFreightQuoteSettings)
      .where(eq(companyFreightQuoteSettings.companyId, input.companyId))
      .limit(1)
    return row === undefined ? null : toRecord(row)
  }

  public async upsert(input: {
    readonly companyId: string
    readonly updatedByUserId: string
    readonly values: FreightQuoteSettingsValues
  }): Promise<FreightQuoteSettingsRecord> {
    const columns = toColumns(input.values)
    const [row] = await this.database
      .insert(companyFreightQuoteSettings)
      .values({ ...columns, companyId: input.companyId, updatedByUserId: input.updatedByUserId })
      .onConflictDoUpdate({
        set: { ...columns, updatedAt: new Date(), updatedByUserId: input.updatedByUserId },
        target: companyFreightQuoteSettings.companyId,
      })
      .returning()
    if (row === undefined) throw new Error('COMPANY_FREIGHT_QUOTE_SETTINGS_UPSERT_RETURNED_NOTHING')
    return toRecord(row)
  }

  public async remove(input: { readonly companyId: string }): Promise<void> {
    await this.database
      .delete(companyFreightQuoteSettings)
      .where(eq(companyFreightQuoteSettings.companyId, input.companyId))
  }

  public async appendAudit(entry: FreightQuoteSettingsAuditEntry): Promise<void> {
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

function toColumns(values: FreightQuoteSettingsValues): {
  readonly adValoremPercent: string
  readonly applyAnttFloor: boolean
  readonly driverCostPerKm: string
  readonly expectedOccupancyPercent: string
  readonly fixedCostPerKm: string
  readonly fuelKmPerLiter: string | null
  readonly grisPercent: string
  readonly maintenanceCostPerKm: string
  readonly marginPercent: string
  readonly tiresCostPerKm: string
} {
  return { ...values }
}

function toRecord(row: SettingsRow): FreightQuoteSettingsRecord {
  return {
    updatedAt: row.updatedAt,
    values: {
      adValoremPercent: row.adValoremPercent,
      applyAnttFloor: row.applyAnttFloor,
      driverCostPerKm: row.driverCostPerKm,
      expectedOccupancyPercent: row.expectedOccupancyPercent,
      fixedCostPerKm: row.fixedCostPerKm,
      fuelKmPerLiter: row.fuelKmPerLiter,
      grisPercent: row.grisPercent,
      maintenanceCostPerKm: row.maintenanceCostPerKm,
      marginPercent: row.marginPercent,
      tiresCostPerKm: row.tiresCostPerKm,
    },
  }
}
