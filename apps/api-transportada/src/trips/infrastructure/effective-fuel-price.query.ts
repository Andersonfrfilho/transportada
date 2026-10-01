/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O preço do combustível que a conta da viagem usa é **o mesmo** que o R$/km da ficha do veículo
 * usa: `ajuste da empresa ?? tarifa da ANEEL ?? referência da ANP da UF`
 * (`companies/domain/fuel-price.policy.ts`).
 *
 * ⚠️ Até a spec 100 as duas consultas de viagem liam **só** `company_fuel_prices`, o ajuste manual.
 * Como a instalação normal não ajusta preço nenhum — ela deixa a ANP responder, que é o ponto da
 * ADR-0033 —, a parcela de combustível saía como `NO_FUEL_BASELINE` em toda viagem, com o preço
 * publicado no banco e impresso na tela de frota ao lado. Ler o ajuste sozinho aqui e o efetivo lá
 * fazia o mesmo veículo ter dois R$/km, e só um deles aparecia na margem.
 */
import { DrizzleFuelPriceRepository } from '../../companies/infrastructure/drizzle-fuel-price.repository.js'
import { resolveEffectiveFuelPrice } from '../../companies/domain/fuel-price.policy.js'
import type { CompanySettingsDatabase } from '../../companies/infrastructure/drizzle-company-settings.types.js'
import { FUEL_PRODUCTS, type FuelProduct } from '../../shared/fuel.constant.js'
import {
  resolveVehicleFuelBaseline as collapseVehicleFuelBaseline,
  type RouteOptionVehicle,
} from '../../toll-booths/domain/route-option.policy.js'

export async function readEffectiveFuelPrice(
  database: CompanySettingsDatabase,
  input: { readonly companyId: string; readonly product: FuelProduct | null },
): Promise<null | string> {
  if (input.product === null) return null

  const facts = await new DrizzleFuelPriceRepository(database).loadFacts({
    companyId: input.companyId,
  })

  return resolveEffectiveFuelPrice({ ...facts, product: input.product }).effectivePricePerUnit
}

/** O cadastro guarda o combustível como texto livre do catálogo; fora dele não há preço a buscar. */
export function toFuelProduct(value: null | string): FuelProduct | null {
  return FUEL_PRODUCTS.includes(value as FuelProduct) ? (value as FuelProduct) : null
}

export type ResolveVehicleFuelBaselineParams = {
  readonly companyId: string
  readonly database: CompanySettingsDatabase
  /** `fleet_vehicles.average_consumption` — km por litro, ou `null` quando a ficha não declara. */
  readonly kilometersPerLiter: null | string
  readonly fuelType: null | string
}

/**
 * Consumo e preço efetivo do combustível do veículo — o que `rankRouteOptions` compara. Um lugar só
 * para a leitura ao vivo da rota e para o congelamento: duas cópias desta conta deixariam o mesmo
 * veículo com "mais barata" diferente em cada tela.
 *
 * ⚠️ N13 (segunda revisão da 153): a busca é daqui, mas quem decide se o par colapsa para
 * `NO_FUEL_BASELINE` é `resolveVehicleFuelBaseline` de `route-option.policy.ts` — o único lugar que
 * sabe essa regra. Duas cópias da mesma checagem (`=== null ? NO_FUEL_BASELINE : ...`) discordariam
 * caladas no dia em que uma delas mudasse sozinha.
 */
export async function resolveVehicleFuelBaseline(
  input: ResolveVehicleFuelBaselineParams,
): Promise<RouteOptionVehicle> {
  const pricePerLiter =
    input.kilometersPerLiter === null
      ? null
      : await readEffectiveFuelPrice(input.database, {
          companyId: input.companyId,
          product: toFuelProduct(input.fuelType),
        })

  return collapseVehicleFuelBaseline({
    kilometersPerLiter: input.kilometersPerLiter,
    pricePerLiter,
  })
}
