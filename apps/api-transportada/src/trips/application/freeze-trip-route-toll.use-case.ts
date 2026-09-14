/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 090 T11: congela o pedágio no mesmo instante em que o roteiro é planejado — a mesma
 * conta que `trip_dispatch_snapshots` já faz para o roteiro em si.
 *
 * ⚠️ Chamar o roteirizador de novo na viagem já criada separada de quando ela foi planejada
 * separaria a rota de hoje da distância de ontem (a divergência da D4 dentro do mesmo painel).
 * Por isso o congelamento acontece **aqui**, na mesma chamada que resolve o roteiro no momento do
 * planejamento — nunca na leitura da valoração, que só lê o que já foi decidido.
 */
import {
  readRouteGeometry,
  type ReadRouteGeometryDepotPort,
  type ReadRouteGeometryTollBoothsPort,
  type RouteGeometryToll,
} from './read-route-geometry.use-case.js'
import type { TollMultiplier } from '../../toll-booths/domain/toll-category.policy.js'
import type { AxleCount, TollRouteCost } from '../../toll-booths/domain/toll-route-cost.policy.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import type { RouteGeometryPort } from './route-geometry.port.js'

export type FreezeTripRouteTollVehicleContext = {
  readonly axles: AxleCount | null
  /** A categoria do veículo — anda junto de `axles`, e é ela que multiplica a tarifa base. */
  readonly multiplier: TollMultiplier | null
  readonly hasAutomaticTollPayment: boolean
}

export type FreezeTripRouteTollPort = {
  /** `null` quando a viagem sumiu entre o gate do planejamento e aqui — não há o que congelar. */
  readTollContext(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<FreezeTripRouteTollVehicleContext | null>
  readStopCoordinates(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly RouteGeometryPoint[]>
  /** `toll: null` **substitui** o que estava gravado — replanejar regrava o congelado sempre. */
  writePlannedToll(input: {
    readonly companyId: string
    readonly toll: null | TollRouteCost
    readonly tripId: string
  }): Promise<void>
}

export type FreezeTripRouteTollInput = {
  readonly companyId: string
  readonly depot?: null | ReadRouteGeometryDepotPort
  readonly geometry: RouteGeometryPort
  readonly repository: FreezeTripRouteTollPort
  readonly tollBooths: ReadRouteGeometryTollBoothsPort
  readonly tripId: string
}

export async function freezeTripRouteToll(input: FreezeTripRouteTollInput): Promise<void> {
  const vehicle = await input.repository.readTollContext(input)
  if (vehicle === null) return

  const stops = await input.repository.readStopCoordinates(input)

  const road = await readRouteGeometry({
    axles: vehicle.axles,
    multiplier: vehicle.multiplier,
    depot: input.depot ?? null,
    geometry: input.geometry,
    hasAutomaticTollPayment: vehicle.hasAutomaticTollPayment,
    stops,
    tollBooths: input.tollBooths,
  })

  await input.repository.writePlannedToll({
    companyId: input.companyId,
    toll: toFrozenToll(road.toll),
    tripId: input.tripId,
  })
}

/**
 * `RouteGeometryToll` carrega `tariffObservedOn` — data de leitura fresca do catálogo, não parte
 * da decisão congelada — e por isso não entra no que se grava.
 */
function toFrozenToll(toll: null | RouteGeometryToll): null | TollRouteCost {
  if (toll === null) return null

  return {
    axles: toll.axles,
    booths: toll.booths,
    boothsFallenBackToManual: toll.boothsFallenBackToManual,
    boothsWithoutCharge: toll.boothsWithoutCharge,
    chargePerAxle: toll.chargePerAxle,
    /** ⚠️ O multiplicador entra no congelado: sem ele o total gravado fica sem a conta que o gerou. */
    multiplier: toll.multiplier,
    paymentMode: toll.paymentMode,
    total: toll.total,
  }
}
