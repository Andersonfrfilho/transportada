/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Grava o preço manual de um produto e devolve como aquele produto ficou. A releitura é o que faz a
 * resposta trazer a referência da ANP ao lado do preço digitado — a tela mostra as duas.
 */
import { resolveEffectiveFuelPrice, type EffectiveFuelPrice } from '../domain/fuel-price.policy.js'
import type { FuelPriceAdjustment, FuelPricePort } from './fuel-price.port.js'

export function createAdjustFuelPriceUseCase(input: { readonly fuelPrices: FuelPricePort }): {
  readonly execute: (request: FuelPriceAdjustment) => Promise<EffectiveFuelPrice>
} {
  return {
    execute: async (request) => {
      await input.fuelPrices.saveAdjustment(request)
      const facts = await input.fuelPrices.loadFacts({ companyId: request.companyId })
      return resolveEffectiveFuelPrice({ ...facts, product: request.product })
    },
  }
}
