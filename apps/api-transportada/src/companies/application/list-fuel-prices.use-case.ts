/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { resolveEffectiveFuelPrices, type EffectiveFuelPrice } from '../domain/fuel-price.policy.js'
import type { FuelPricePort } from './fuel-price.port.js'

export function createListFuelPricesUseCase(input: { readonly fuelPrices: FuelPricePort }): {
  readonly execute: (request: {
    readonly companyId: string
  }) => Promise<readonly EffectiveFuelPrice[]>
} {
  return {
    execute: async ({ companyId }) =>
      resolveEffectiveFuelPrices(await input.fuelPrices.loadFacts({ companyId })),
  }
}
