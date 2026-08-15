/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A frota não conhece o repositório de preços: ela pede a tabela efetiva da empresa, indexada por
 * produto, e é este adaptador que a resolve com a mesma política que a tela de configurações usa.
 */
import type { FuelPricePort } from '../../companies/application/fuel-price.port.js'
import {
  resolveEffectiveFuelPrices,
  type EffectiveFuelPrice,
} from '../../companies/domain/fuel-price.policy.js'
import type { FuelProduct } from '../../shared/fuel.constant.js'
import type { FleetFuelPricePort } from '../application/fleet.port.js'

export class CompanyFuelPriceGateway implements FleetFuelPricePort {
  public constructor(private readonly fuelPrices: FuelPricePort) {}

  public async resolveByProduct(input: {
    readonly companyId: string
  }): Promise<ReadonlyMap<FuelProduct, EffectiveFuelPrice>> {
    const facts = await this.fuelPrices.loadFacts({ companyId: input.companyId })
    return new Map(resolveEffectiveFuelPrices(facts).map((price) => [price.product, price]))
  }
}
