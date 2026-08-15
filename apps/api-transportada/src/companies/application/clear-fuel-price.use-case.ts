/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Apaga o ajuste manual de um produto: dali em diante ele volta a valer o preço da ANP da UF da
 * empresa, e os outros quatro não se mexem.
 */
import type { FuelPricePort, FuelPriceProductSelection } from './fuel-price.port.js'

export function createClearFuelPriceUseCase(input: { readonly fuelPrices: FuelPricePort }): {
  readonly execute: (request: FuelPriceProductSelection) => Promise<void>
} {
  return {
    execute: (request) => input.fuelPrices.clearAdjustment(request),
  }
}
