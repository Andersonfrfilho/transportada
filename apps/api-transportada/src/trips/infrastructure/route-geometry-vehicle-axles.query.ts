/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 090 T7: quantos eixos o veículo escolhido no diálogo **Nova viagem** tem, para o pedágio da
 * montagem sair com o total certo. `resolveDeclaredVehicleAxles` (T6) é a única política que
 * decide isso — esta consulta só busca a ficha.
 *
 * Spec 094 T1: a mesma ficha também dá o consumo e o preço do combustível — o que
 * `rankRouteOptions` (T2) precisa para saber qual alternativa é a mais barata. Uma consulta só,
 * porque as duas coisas vêm da mesma linha de `fleet_vehicles`.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { companyFuelPrices } from '../../database/company-fuel-prices.schema.js'
import { fleetVehicles } from '../../database/fleet.schema.js'
import { FUEL_PRODUCTS, type FuelProduct } from '../../shared/fuel.constant.js'
import { resolveDeclaredVehicleAxles } from '../../toll-booths/domain/vehicle-axles.policy.js'
import type { AxleCount } from '../../toll-booths/domain/toll-route-cost.policy.js'
import type { RouteOptionVehicle } from '../../toll-booths/domain/route-option.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const NO_FUEL_BASELINE: RouteOptionVehicle = { kilometersPerLiter: null, pricePerLiter: null }

export type RouteGeometryVehicleContext = Readonly<{
  axles: AxleCount | null
  fuelBaseline: RouteOptionVehicle
}>

export function createRouteGeometryVehicleAxlesQuery(database: Database): Readonly<{
  /**
   * O eixo, mais o consumo e o preço do combustível do veículo — spec 094 D1: sem os dois, nenhuma
   * opção recebe o rótulo de mais barata, e `readVehicleContext` devolve `NO_FUEL_BASELINE` em vez
   * de inventar um consumo.
   */
  readVehicleContext: (input: {
    readonly companyId: string
    readonly vehicleId: string
  }) => Promise<RouteGeometryVehicleContext>
}> {
  return {
    async readVehicleContext(input) {
      const [vehicle] = await database
        .select({
          axleCount: fleetVehicles.axleCount,
          fuelType: fleetVehicles.fuelType,
          kilometersPerLiter: fleetVehicles.averageConsumption,
          vehicleType: fleetVehicles.vehicleType,
        })
        .from(fleetVehicles)
        .where(
          and(eq(fleetVehicles.companyId, input.companyId), eq(fleetVehicles.id, input.vehicleId)),
        )
        .limit(1)
      if (vehicle === undefined) return { axles: null, fuelBaseline: NO_FUEL_BASELINE }

      const pricePerLiter = await readFuelPrice(database, {
        companyId: input.companyId,
        product: toFuelProduct(vehicle.fuelType),
      })

      return {
        axles: resolveDeclaredVehicleAxles(vehicle),
        fuelBaseline:
          vehicle.kilometersPerLiter === null || pricePerLiter === null
            ? NO_FUEL_BASELINE
            : { kilometersPerLiter: vehicle.kilometersPerLiter, pricePerLiter },
      }
    },
  }
}

/**
 * O mesmo ajuste da empresa que `read-trip-valuation.use-case.ts` lê para o custo previsto da
 * viagem — sem ele, ninguém declarou preço para este combustível, e não há o que comparar.
 */
async function readFuelPrice(
  database: Database,
  input: { readonly companyId: string; readonly product: FuelProduct | null },
): Promise<null | string> {
  if (input.product === null) return null

  const [row] = await database
    .select({ pricePerUnit: companyFuelPrices.pricePerUnit })
    .from(companyFuelPrices)
    .where(
      and(
        eq(companyFuelPrices.companyId, input.companyId),
        eq(companyFuelPrices.product, input.product),
      ),
    )
    .limit(1)

  return row?.pricePerUnit ?? null
}

/** O cadastro guarda o combustível como texto livre do catálogo; fora dele não há preço a buscar. */
function toFuelProduct(value: null | string): FuelProduct | null {
  return FUEL_PRODUCTS.includes(value as FuelProduct) ? (value as FuelProduct) : null
}
