/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  previewTripValuation,
  type TripValuationContext,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import type { RouteGeometryPoint } from '../../src/trips/domain/route-geometry.policy.js'
import type { RouteGeometryRoad } from '../../src/trips/application/route-geometry.port.js'
import { VALUATION_GAPS } from '../../src/trips/domain/trip-valuation.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const VEHICLE_ID = '00000000-0000-4000-8000-000000000f01'

function context(overrides: Partial<TripValuationContext> = {}): TripValuationContext {
  return {
    distanceMeters: null,
    documents: [],
    fuelPricePerLiter: '6.0000',
    vehicle: { kilometersPerLiter: '2.5000', otherCostsPerKilometer: '0.3000' },
    ...overrides,
  }
}

function run(input: {
  readonly points: readonly RouteGeometryPoint[]
  readonly road: RouteGeometryRoad | null
  readonly stopOrder?: readonly string[]
}) {
  const coordinateCalls: object[] = []
  const geometryCalls: (readonly RouteGeometryPoint[])[] = []

  return {
    coordinateCalls,
    geometryCalls,
    result: previewTripValuation({
      companyId: COMPANY_ID,
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
        readPreviewStopCoordinates: (call) => {
          coordinateCalls.push(call)
          return Promise.resolve(input.points)
        },
      },
      stopOrder: input.stopOrder ?? [],
      /** Sem eixo declarado no fixture, o pedágio da T9 não entra na conta — este teste é da T6B. */
      tollBooths: { readByNodeIds: () => Promise.resolve([]) },
      vehicleId: VEHICLE_ID,
    }),
  }
}

describe('a prévia lê a distância que o mapa desenhou (spec 090 D3)', () => {
  it('soma os trechos da geometria e alimenta combustível e outros-por-quilômetro', async () => {
    const world = run({
      points: [
        { latitude: -21.1775, longitude: -47.8103 },
        { latitude: -21.9967, longitude: -47.4256 },
      ],
      road: {
        legs: [{ distanceMetres: 106_600, durationSeconds: 5_160 }],
        nodeIds: [1, 2, 3],
        points: [],
      },
    })
    const valuation = await world.result
    const byKind = new Map(valuation.costParcels.map((parcel) => [parcel.kind, parcel]))

    /** 106,6 km ÷ 2,5 km/l = 42,64 litros × 6,00 = 255,84. */
    expect(byKind.get('fuel')).toMatchObject({ amount: '255.8400', source: 'estimated' })
    expect(byKind.get('other_per_kilometer')).toMatchObject({
      amount: '31.9800',
      source: 'estimated',
    })
  })

  it('manda o stopOrder recebido para o mesmo agrupamento da prévia de carga', async () => {
    const world = run({
      points: [],
      road: null,
      stopOrder: ['campinas|13000000|20', 'barrinha|14710000|100'],
    })
    await world.result

    expect(world.coordinateCalls).toEqual([
      {
        companyId: COMPANY_ID,
        nfeDocumentIds: ['00000000-0000-4000-8000-000000000c01'],
        stopOrder: ['campinas|13000000|20', 'barrinha|14710000|100'],
      },
    ])
  })

  it('soma vários trechos quando há mais de duas paradas', async () => {
    const world = run({
      points: [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
        { latitude: 2, longitude: 2 },
      ],
      road: {
        legs: [
          { distanceMetres: 30_000, durationSeconds: 1_500 },
          { distanceMetres: 20_000, durationSeconds: 1_000 },
        ],
        nodeIds: null,
        points: [],
      },
    })
    const valuation = await world.result
    const byKind = new Map(valuation.costParcels.map((parcel) => [parcel.kind, parcel]))

    /** 50 km a 2,5 km/l e 6,00 o litro: 20 litros × 6,00 = 120,00. */
    expect(byKind.get('fuel')).toMatchObject({ amount: '120.0000', source: 'estimated' })
  })

  it('sem geometria disponível, a lacuna de sempre continua valendo', async () => {
    const world = run({ points: [{ latitude: 0, longitude: 0 }], road: null })
    const valuation = await world.result
    const byKind = new Map(valuation.costParcels.map((parcel) => [parcel.kind, parcel]))

    expect(byKind.get('fuel')).toMatchObject({
      amount: '0.0000',
      gap: VALUATION_GAPS.noPlannedDistance,
      source: 'missing',
    })
    expect(byKind.get('other_per_kilometer')?.gap).toBe(VALUATION_GAPS.noPlannedDistance)
    /** Nada chamado ao roteirizador com menos de duas paradas — a porta nem responde. */
    expect(world.geometryCalls).toEqual([])
  })

  it('menos de duas coordenadas resolvidas também é ausência de distância', async () => {
    const world = run({ points: [], road: null })
    const valuation = await world.result
    const byKind = new Map(valuation.costParcels.map((parcel) => [parcel.kind, parcel]))

    expect(byKind.get('fuel')?.gap).toBe(VALUATION_GAPS.noPlannedDistance)
  })
})
