/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'

import { companyTollBoothCharges } from '../../database/company-toll-booth-charge.schema.js'
import type { TollBoothChargeAdjustmentRow } from '../domain/toll-booth-charge.policy.js'
import type {
  SaveTollBoothChargeAdjustment,
  TollBoothChargePort,
  TollBoothChargeSelection,
} from '../application/toll-booth-charge.port.js'
import type { CompanySettingsDatabase } from './drizzle-company-settings.types.js'

export class DrizzleTollBoothChargeRepository implements TollBoothChargePort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async loadAdjustments(input: {
    readonly companyId: string
  }): Promise<readonly TollBoothChargeAdjustmentRow[]> {
    const rows = await this.database
      .select(this.columns())
      .from(companyTollBoothCharges)
      .where(eq(companyTollBoothCharges.companyId, input.companyId))
    return rows.map(toRow)
  }

  public async loadAdjustmentsByNodeIds(input: {
    readonly companyId: string
    readonly osmNodeIds: readonly number[]
  }): Promise<readonly TollBoothChargeAdjustmentRow[]> {
    if (input.osmNodeIds.length === 0) return []

    const rows = await this.database
      .select(this.columns())
      .from(companyTollBoothCharges)
      .where(
        and(
          eq(companyTollBoothCharges.companyId, input.companyId),
          inArray(companyTollBoothCharges.osmNodeId, input.osmNodeIds.map(BigInt)),
        ),
      )
    return rows.map(toRow)
  }

  public async saveAdjustment(input: SaveTollBoothChargeAdjustment): Promise<void> {
    await this.database
      .insert(companyTollBoothCharges)
      .values({
        actorUserId: input.actorUserId,
        chargeCar: input.chargeCar,
        chargePerAxle: input.chargePerAxle,
        companyId: input.companyId,
        observedOn: input.observedOn,
        osmNodeId: BigInt(input.osmNodeId),
      })
      .onConflictDoUpdate({
        set: {
          actorUserId: input.actorUserId,
          chargeCar: input.chargeCar,
          chargePerAxle: input.chargePerAxle,
          observedOn: input.observedOn,
          updatedAt: sql`now()`,
        },
        target: [companyTollBoothCharges.companyId, companyTollBoothCharges.osmNodeId],
      })
  }

  public async clearAdjustment(input: TollBoothChargeSelection): Promise<void> {
    await this.database
      .delete(companyTollBoothCharges)
      .where(
        and(
          eq(companyTollBoothCharges.companyId, input.companyId),
          eq(companyTollBoothCharges.osmNodeId, BigInt(input.osmNodeId)),
        ),
      )
  }

  private columns() {
    return {
      actorUserId: companyTollBoothCharges.actorUserId,
      chargeCar: companyTollBoothCharges.chargeCar,
      chargePerAxle: companyTollBoothCharges.chargePerAxle,
      observedOn: companyTollBoothCharges.observedOn,
      osmNodeId: companyTollBoothCharges.osmNodeId,
      updatedAt: companyTollBoothCharges.updatedAt,
    }
  }
}

function toRow(row: {
  readonly actorUserId: string
  readonly chargeCar: string | null
  readonly chargePerAxle: string | null
  readonly observedOn: string
  readonly osmNodeId: bigint
  readonly updatedAt: Date
}): TollBoothChargeAdjustmentRow {
  return {
    actorUserId: row.actorUserId,
    chargeCar: row.chargeCar,
    chargePerAxle: row.chargePerAxle,
    observedOn: row.observedOn,
    osmNodeId: Number(row.osmNodeId),
    updatedAt: row.updatedAt,
  }
}
