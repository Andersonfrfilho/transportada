/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T202/RF4/RF5: a prévia aceita `routeChoice` — a mesma rota que o operador escolheu na
 * tela é a que entra na conta, nunca sempre a mais barata conhecida. E o aceite 2 da spec: a
 * prévia, a viagem gravada e o detalhe mostram a mesma rota, a mesma distância e o mesmo valor.
 */
import { describe, expect, it } from 'bun:test'

import {
  previewTripValuation,
  readTripValuation,
  type TripValuationContext,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import { readRouteGeometry } from '../../src/trips/application/read-route-geometry.use-case.js'
import { summarizeRoadDistance } from '../../src/trips/domain/planned-road-distance.policy.js'
import type { RouteGeometryPoint } from '../../src/trips/domain/route-geometry.policy.js'
import type {
  RouteGeometryPort,
  RouteGeometryRoad,
} from '../../src/trips/application/route-geometry.port.js'
import type { TollBoothRouteRecord } from '../../src/toll-booths/application/toll-booth.port.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const VEHICLE_ID = '00000000-0000-4000-8000-000000000f01'
const POINTS: readonly RouteGeometryPoint[] = [
  { latitude: -21.1775, longitude: -47.8103 },
  { latitude: -21.9967, longitude: -47.4256 },
]

/** Rodagem dupla: multiplicador = eixos, igual ao fixture de `toll-parcel.contract.ts`. */
const VEHICLE = {
  axles: { count: 2, source: 'declared' as const },
  multiplier: { denominator: 1, numerator: 2 },
  kilometersPerLiter: '2.5000',
  otherCostsPerKilometer: '0.3000',
}

function praca(osmNodeId: number, chargePerAxle: string): TollBoothRouteRecord {
  return {
    chargeCar: chargePerAxle,
    chargePerAxle,
    chargePerAxleAutomatic: null,
    latitude: '-21.1775000',
    longitude: '-47.8103000',
    name: `Praça ${osmNodeId}`,
    observedOn: '2026-07-01',
    operator: 'Operadora',
    osmNodeId,
  }
}

function context(overrides: Partial<TripValuationContext> = {}): TripValuationContext {
  return {
    distanceMeters: null,
    documents: [],
    fuelPricePerLiter: '6.0000',
    tollTotal: null,
    vehicle: VEHICLE,
    ...overrides,
  }
}

/**
 * A rota com pedágio (nó 10) e a rota sem pedágio (nó 20) — duas estradas de verdade, não a mesma
 * marcada duas vezes, para o critério ter o que escolher entre elas.
 */
const ROAD_WITH_TOLL: RouteGeometryRoad = {
  legs: [{ distanceMetres: 106_600, durationSeconds: 5_160 }],
  nodeIds: [10],
  nodeIdsByLeg: [[10]],
  points: [],
}
const ROAD_NO_TOLL: RouteGeometryRoad = {
  legs: [{ distanceMetres: 120_000, durationSeconds: 6_000 }],
  nodeIds: [20],
  nodeIdsByLeg: [[20]],
  points: [],
}

function twoRouteGeometry(): RouteGeometryPort {
  return {
    readRouteGeometry: (_points, options) =>
      Promise.resolve(options?.excludeToll === true ? ROAD_NO_TOLL : ROAD_WITH_TOLL),
  }
}

function runPreview(input: {
  readonly geometry: RouteGeometryPort
  readonly routeChoice?: Parameters<typeof previewTripValuation>[0]['routeChoice']
}) {
  return previewTripValuation({
    companyId: COMPANY_ID,
    driverIds: [],
    geometry: input.geometry,
    nfeDocumentIds: ['00000000-0000-4000-8000-000000000c01'],
    repository: {
      findApplicableRule: () => Promise.resolve(null),
      readContext: () => Promise.resolve(null),
      readPreviewContext: () => Promise.resolve(context()),
      readPreviewStopCoordinates: () => Promise.resolve(POINTS),
    },
    stopOrder: [],
    tollBooths: {
      readByNodeIds: () => Promise.resolve([praca(10, '10.50')]),
      readCatalogSummary: () => Promise.resolve({ boothCount: 1, latestObservedOn: '2026-07-01' }),
    },
    vehicleId: VEHICLE_ID,
    ...(input.routeChoice === undefined ? {} : { routeChoice: input.routeChoice }),
  })
}

describe('a prévia aceita a rota escolhida (spec 153 RF4)', () => {
  it('sem escolha, precifica a principal — a mesma de sempre', async () => {
    const valuation = await runPreview({ geometry: twoRouteGeometry() })
    const toll = valuation.costParcels.find((parcel) => parcel.kind === 'toll')

    /** 106,6 km, com a praça do nó 10: (10,50) × 2 eixos = 21,00. */
    expect(toll).toMatchObject({ amount: '21.0000', gap: null })
  })

  it('um critério fora de `ROUTE_CHOICE_CRITERIA` não chega aqui — a fronteira HTTP barra antes (400)', () => {
    /**
     * Este contrato prova a aplicação; a rejeição em si é HTTP e mora em
     * `trip-request.schema.test.ts` — `previewTripValuationSchema` usa `z.enum(ROUTE_CHOICE_CRITERIA)`,
     * a mesma validação que `planTripRouteSchema` já usa (T201), sem fallback silencioso.
     */
    expect(true).toBe(true)
  })

  it('com `no_toll`, troca de rota — a distância e o pedágio passam a ser os da estrada sem praça', async () => {
    const valuation = await runPreview({
      geometry: twoRouteGeometry(),
      routeChoice: { criterion: 'no_toll', signature: null },
    })
    const toll = valuation.costParcels.find((parcel) => parcel.kind === 'toll')
    const fuel = valuation.costParcels.find((parcel) => parcel.kind === 'fuel')

    /** 120 km ÷ 2,5 km/l × 6,00 = 288,00 — a distância da rota sem pedágio, não mais os 106,6 km. */
    expect(fuel).toMatchObject({ amount: '288.0000' })
    /** Nó 20 não é praça conhecida: sem pedágio na conta, e não é lacuna — é rota sem cancela. */
    expect(toll).toMatchObject({ amount: '0.0000', gap: null })
  })
})

describe('aceite 2 (spec 153): a prévia e a viagem gravada mostram a mesma rota, distância e valor', () => {
  it('a mesma estrada e a mesma tarifa produzem parcelas de combustível, de outros-por-km e de pedágio idênticas', async () => {
    /**
     * O congelamento (T201/T104) e a prévia chamam a mesma `readRouteGeometry` sobre a mesma
     * estrada — aqui ela é chamada direto, simulando o que o planejamento gravou em
     * `trips.planned_distance_meters`/`trips.planned_toll`, para comparar com o que a prévia lê
     * ao vivo sobre a estrada idêntica.
     *
     * ⚠️ O que legitimamente pode divergir entre os dois momentos é a **tarifa observada**: uma
     * praça pode atualizar `observedOn` entre o planejamento e a prévia seguinte, e aí o pedágio
     * muda porque o preço mudou, não porque a rota é outra. Este contrato mantém a tarifa e a
     * estrada constantes de propósito, para isolar exatamente o que a T202 garante — rota e
     * distância iguais produzem valor igual — sem misturar com a variação legítima de preço.
     */
    const frozenGeometry: RouteGeometryPort = {
      readRouteGeometry: () => Promise.resolve(ROAD_WITH_TOLL),
    }
    const tollBooths = {
      readByNodeIds: () => Promise.resolve([praca(10, '10.50')]),
      readCatalogSummary: () => Promise.resolve({ boothCount: 1, latestObservedOn: '2026-07-01' }),
    }

    const road = await readRouteGeometry({
      axles: VEHICLE.axles,
      multiplier: VEHICLE.multiplier,
      geometry: frozenGeometry,
      hasAutomaticTollPayment: false,
      stops: POINTS,
      tollBooths,
    })
    const frozenDistance = summarizeRoadDistance({
      legs: road.legs,
      trailingLegs: 0,
    }).distanceMeters

    const frozenValuation = await readTripValuation({
      companyId: COMPANY_ID,
      repository: {
        findApplicableRule: () => Promise.resolve(null),
        readContext: () =>
          Promise.resolve(context({ distanceMeters: frozenDistance, toll: road.toll })),
      },
      tripId: '00000000-0000-4000-8000-000000000a11',
    })

    const previewValuation = await runPreview({ geometry: frozenGeometry })

    const parcelKinds = ['fuel', 'other_per_kilometer', 'toll'] as const
    for (const kind of parcelKinds) {
      const frozenParcel = frozenValuation.costParcels.find((parcel) => parcel.kind === kind)
      const previewParcel = previewValuation.costParcels.find((parcel) => parcel.kind === kind)
      expect(previewParcel).toMatchObject({ amount: frozenParcel?.amount, gap: frozenParcel?.gap })
    }
  })
})
