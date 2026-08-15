/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FuelProduct } from '../../shared/fuel.constant.js'
import type { FuelPriceFacts } from '../domain/fuel-price.policy.js'

export type FuelPriceAdjustment = {
  readonly companyId: string
  readonly pricePerUnit: string
  readonly product: FuelProduct
}

export type FuelPriceProductSelection = {
  readonly companyId: string
  readonly product: FuelProduct
}

export type FuelPricePort = {
  clearAdjustment(input: FuelPriceProductSelection): Promise<void>
  loadFacts(input: { readonly companyId: string }): Promise<FuelPriceFacts>
  saveAdjustment(input: FuelPriceAdjustment): Promise<void>
}
