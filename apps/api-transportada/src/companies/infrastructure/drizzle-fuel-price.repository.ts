/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq, sql } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { companyFuelPrices } from '../../database/company-fuel-prices.schema.js'
import { fuelPriceReferences } from '../../database/fuel-reference.schema.js'
import type {
  FuelPriceAdjustment,
  FuelPricePort,
  FuelPriceProductSelection,
} from '../application/fuel-price.port.js'
import type { FuelPriceFacts } from '../domain/fuel-price.policy.js'
import type { CompanySettingsDatabase } from './drizzle-company-settings.types.js'

export class DrizzleFuelPriceRepository implements FuelPricePort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async loadFacts(input: { readonly companyId: string }): Promise<FuelPriceFacts> {
    const state = await this.resolveState(input.companyId)
    const [adjustments, references] = await Promise.all([
      this.loadAdjustments(input.companyId),
      this.loadReferences(state),
    ])
    return { adjustments, references, state }
  }

  public async saveAdjustment(input: FuelPriceAdjustment): Promise<void> {
    await this.database
      .insert(companyFuelPrices)
      .values({
        companyId: input.companyId,
        pricePerUnit: input.pricePerUnit,
        product: input.product,
      })
      .onConflictDoUpdate({
        set: { pricePerUnit: input.pricePerUnit, updatedAt: sql`now()` },
        target: [companyFuelPrices.companyId, companyFuelPrices.product],
      })
  }

  public async clearAdjustment(input: FuelPriceProductSelection): Promise<void> {
    await this.database
      .delete(companyFuelPrices)
      .where(
        and(
          eq(companyFuelPrices.companyId, input.companyId),
          eq(companyFuelPrices.product, input.product),
        ),
      )
  }

  /** Empresa recém-criada ainda não tem perfil fiscal: sem UF, nenhuma referência da ANP casa. */
  private async resolveState(companyId: string): Promise<string> {
    const [profile] = await this.database
      .select({ state: companyFiscalProfiles.state })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, companyId))
      .limit(1)
    return profile?.state ?? ''
  }

  private async loadAdjustments(companyId: string): Promise<FuelPriceFacts['adjustments']> {
    return this.database
      .select({
        pricePerUnit: companyFuelPrices.pricePerUnit,
        product: companyFuelPrices.product,
        updatedAt: companyFuelPrices.updatedAt,
      })
      .from(companyFuelPrices)
      .where(eq(companyFuelPrices.companyId, companyId))
  }

  /** Uma linha por produto — a semana mais recente da UF, não o histórico inteiro da série. */
  private async loadReferences(state: string): Promise<FuelPriceFacts['references']> {
    return this.database
      .selectDistinctOn([fuelPriceReferences.product], {
        pricePerUnit: fuelPriceReferences.pricePerUnit,
        product: fuelPriceReferences.product,
        state: fuelPriceReferences.state,
        weekEndingOn: fuelPriceReferences.weekEndingOn,
      })
      .from(fuelPriceReferences)
      .where(eq(fuelPriceReferences.state, state))
      .orderBy(fuelPriceReferences.product, desc(fuelPriceReferences.weekEndingOn))
  }
}
