/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 342: a estrada da cotação é a **mesma** da viagem — `readRouteGeometry` (OSRM + praças por nó
 * de OSM + tarifa por eixo, com o ajuste da empresa). Nenhuma segunda conta de pedágio ou de
 * distância. Rota indisponível é `null`, nunca reta.
 */
import type { ReadRouteGeometryTollBoothsPort } from '../../trips/application/read-route-geometry.use-case.js'
import { readRouteGeometry } from '../../trips/application/read-route-geometry.use-case.js'
import type { RouteGeometryPort } from '../../trips/application/route-geometry.port.js'
import { resolveTollMultiplier } from '../../toll-booths/domain/toll-category.policy.js'
import { summarizeRoadDistance } from '../../trips/domain/planned-road-distance.policy.js'
import type { QuoteRoadPort } from '../application/freight-quote-by-address.use-case.js'

export function createQuoteRoadGateway(dependencies: {
  readonly geometry: RouteGeometryPort
  readonly tollBoothsFor: (companyId: string) => ReadRouteGeometryTollBoothsPort
}): QuoteRoadPort {
  return {
    async read(input) {
      const road = await readRouteGeometry({
        axles: { count: input.axles, source: 'declared' },
        geometry: dependencies.geometry,
        multiplier: resolveTollMultiplier({
          axleCount: input.axles,
          vehicleType: input.vehicleType,
        }),
        stops: [
          { latitude: Number(input.origin.latitude), longitude: Number(input.origin.longitude) },
          {
            latitude: Number(input.destination.latitude),
            longitude: Number(input.destination.longitude),
          },
        ],
        tollBooths: dependencies.tollBoothsFor(input.companyId),
      })
      if (road.source !== 'road') return null

      const distance = summarizeRoadDistance({ legs: road.legs, trailingLegs: 0 })
      if (distance.distanceMeters === null) return null

      return {
        distanceMeters: distance.distanceMeters,
        toll:
          road.toll === null
            ? null
            : {
                boothsFallenBackToManual: road.toll.boothsFallenBackToManual,
                boothsWithoutCharge: road.toll.boothsWithoutCharge,
                catalogStatus: road.toll.catalog.status,
                total: road.toll.total,
              },
      }
    },
  }
}
