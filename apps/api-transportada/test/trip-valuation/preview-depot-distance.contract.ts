/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 097: a prévia de valoração usa a **mesma** rota da montagem, e por isso a perna do barracão
 * entra na distância dela também. Duas contas diferentes sobre a mesma viagem é o defeito que esta
 * spec existe para acabar — e a prévia é onde o número vira decisão de aceitar carga.
 *
 * ⚠️ A carga **não** muda: o barracão não ocupa baú (D3). Quem guarda isso é
 * `test/cargo-placement/*` mais a ausência de qualquer barracão em `buildCargoPreviewStops`.
 */
import { describe, expect, it } from 'bun:test'

import {
  previewTripValuation,
  type TripValuationContext,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import type { RouteGeometryRoad } from '../../src/trips/application/route-geometry.port.js'
import type { RouteDepot } from '../../src/trips/domain/route-depot.policy.js'
import type { RouteGeometryPoint } from '../../src/trips/domain/route-geometry.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const VEHICLE_ID = '00000000-0000-4000-8000-000000000f01'

const BARRACAO: RouteGeometryPoint = { latitude: -21.1767, longitude: -47.8208 }
const PARADAS: readonly RouteGeometryPoint[] = [
  { latitude: -20.7202, longitude: -47.8866 },
  { latitude: -20.4436, longitude: -48.0139 },
]

function context(): TripValuationContext {
  return {
    distanceMeters: null,
    documents: [],
    fuelPricePerLiter: '6.0000',
    vehicle: { kilometersPerLiter: '2.5000', otherCostsPerKilometer: '0.3000' },
  }
}

function run(input: { readonly depot?: null | RouteDepot; readonly road: RouteGeometryRoad }) {
  const geometryCalls: (readonly RouteGeometryPoint[])[] = []

  return {
    geometryCalls,
    result: previewTripValuation({
      companyId: COMPANY_ID,
      ...(input.depot === undefined || input.depot === null
        ? {}
        : {
            depot: {
              readDepot: async () => input.depot as RouteDepot,
              readDescription: async () => null,
            },
          }),
      driverIds: [],
      geometry: {
        readRouteGeometry: (points) => {
          geometryCalls.push(points)
          return Promise.resolve(input.road)
        },
      },
      nfeDocumentIds: ['00000000-0000-4000-8000-000000000c01'],
      repository: {
        findApplicableRule: () => Promise.resolve(null),
        readContext: () => Promise.resolve(null),
        readPreviewContext: () => Promise.resolve(context()),
        readPreviewStopCoordinates: () => Promise.resolve(PARADAS),
      },
      stopOrder: [],
      tollBooths: { readByNodeIds: () => Promise.resolve([]) },
      vehicleId: VEHICLE_ID,
    }),
  }
}

const SO_AS_PARADAS: RouteGeometryRoad = {
  legs: [{ distanceMetres: 48_300, durationSeconds: 2_340 }],
  nodeIds: null,
  points: [],
}

/** 105,3 km medidos: 57,0 km do barracão até Orlândia, mais os 48,3 km de sempre. */
const COM_O_BARRACAO: RouteGeometryRoad = {
  legs: [
    { distanceMetres: 57_000, durationSeconds: 2_820 },
    { distanceMetres: 48_300, durationSeconds: 2_340 },
  ],
  nodeIds: null,
  points: [],
}

describe('a prévia parte do barracão, como a montagem (spec 097)', () => {
  it('manda o barracão ao roteirizador antes da primeira entrega', async () => {
    const world = run({
      depot: { end: null, origin: BARRACAO, status: 'resolved' },
      road: COM_O_BARRACAO,
    })
    await world.result

    expect(world.geometryCalls[0]).toEqual([BARRACAO, ...PARADAS])
  })

  /**
   * ⚠️ O número que decide: 48,3 km custavam R$ 115,92 de combustível e 105,3 km custam
   * R$ 252,72. O erro era sempre **para baixo**.
   */
  it('a distância da prévia cresce com a perna do barracão', async () => {
    const semBarracao = await run({ road: SO_AS_PARADAS }).result
    const comBarracao = await run({
      depot: { end: null, origin: BARRACAO, status: 'resolved' },
      road: COM_O_BARRACAO,
    }).result

    const combustivelDe = (valuation: Awaited<typeof semBarracao>) =>
      valuation.costParcels.find((parcel) => parcel.kind === 'fuel')?.amount

    /** 48,3 km ÷ 2,5 km/l × 6,00 = 115,92. */
    expect(combustivelDe(semBarracao)).toBe('115.9200')
    /** 105,3 km ÷ 2,5 km/l × 6,00 = 252,72. */
    expect(combustivelDe(comBarracao)).toBe('252.7200')
  })

  /** Sem coordenada de barracão a prévia é a de hoje — nada é inventado (D2). */
  it('sem coordenada de barracão a prévia é a de hoje', async () => {
    const world = run({
      depot: { reason: 'not_geocoded', status: 'absent' },
      road: SO_AS_PARADAS,
    })
    const valuation = await world.result

    expect(world.geometryCalls[0]).toEqual(PARADAS)
    expect(valuation.costParcels.find((parcel) => parcel.kind === 'fuel')?.amount).toBe('115.9200')
  })
})
