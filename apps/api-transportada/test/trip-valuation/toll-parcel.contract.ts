/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 090 T9: o pedágio na conta da viagem. A prévia já chama `readRouteGeometry` para a
 * distância (T6B) — o pedágio pega carona nessa mesma chamada, nunca numa segunda (D4).
 *
 * ⚠️ **Decisão desta task**: lançamento manual (`context.tollTotal`) sempre vence o calculado.
 * Ele é um pagamento real já registrado; o calculado é uma projeção sobre o catálogo do OSM, e
 * deixar a projeção sobrescrever um valor pago de verdade seria a mesma inversão que a receita
 * proíbe entre `measured` e `estimated` (ADR-0049 §2 / spec 065 D7). O calculado só entra quando
 * ninguém lançou nada.
 */
import { describe, expect, it } from 'bun:test'

import {
  previewTripValuation,
  type TripValuationContext,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import type { RouteGeometryPoint } from '../../src/trips/domain/route-geometry.policy.js'
import type { RouteGeometryRoad } from '../../src/trips/application/route-geometry.port.js'
import type { TollBoothRouteRecord } from '../../src/toll-booths/application/toll-booth.port.js'
import { VALUATION_GAPS } from '../../src/trips/domain/trip-valuation.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const VEHICLE_ID = '00000000-0000-4000-8000-000000000f01'
const POINTS: readonly RouteGeometryPoint[] = [
  { latitude: -21.1775, longitude: -47.8103 },
  { latitude: -21.9967, longitude: -47.4256 },
]

function context(overrides: Partial<TripValuationContext> = {}): TripValuationContext {
  return {
    distanceMeters: null,
    documents: [],
    fuelPricePerLiter: '6.0000',
    tollTotal: null,
    vehicle: {
      axles: { count: 2, source: 'declared' },
      kilometersPerLiter: '2.5000',
      otherCostsPerKilometer: '0.3000',
    },
    ...overrides,
  }
}

function praca(osmNodeId: number, chargePerAxle: string): TollBoothRouteRecord {
  return {
    chargeCar: chargePerAxle,
    chargePerAxle,
    latitude: '-21.1775000',
    longitude: '-47.8103000',
    name: `Praça ${osmNodeId}`,
    observedOn: '2026-07-01',
    operator: 'Operadora',
    osmNodeId,
  }
}

function run(input: {
  readonly booths?: readonly TollBoothRouteRecord[]
  readonly context?: TripValuationContext
  readonly road: RouteGeometryRoad | null
}) {
  const geometryCalls: (readonly RouteGeometryPoint[])[] = []
  const tollBoothCalls: (readonly number[])[] = []

  return {
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
        readPreviewContext: () => Promise.resolve(input.context ?? context()),
        readPreviewStopCoordinates: () => Promise.resolve(POINTS),
      },
      stopOrder: [],
      tollBooths: {
        readByNodeIds: (nodeIds) => {
          tollBoothCalls.push(nodeIds)
          return Promise.resolve(input.booths ?? [])
        },
      },
      vehicleId: VEHICLE_ID,
    }),
    tollBoothCalls,
  }
}

describe('o pedágio na conta da viagem (spec 090 T9)', () => {
  it('calcula o pedágio quando ninguém lançou nada', async () => {
    const world = run({
      booths: [praca(10, '10.50'), praca(20, '11.80')],
      road: {
        legs: [{ distanceMetres: 106_600, durationSeconds: 5_160 }],
        nodeIds: [10, 20],
        points: [],
      },
    })
    const valuation = await world.result
    const parcel = valuation.costParcels.find((item) => item.kind === 'toll')

    /** (10,50 + 11,80) × 2 eixos = 44,60. */
    expect(parcel).toMatchObject({ amount: '44.6000', gap: null, source: 'estimated' })
  })

  /** A decisão desta task: pagamento real registrado vence a projeção, sempre. */
  it('lançamento manual vence o calculado, mesmo quando o calculado existe', async () => {
    const world = run({
      booths: [praca(10, '10.50')],
      context: context({ tollTotal: '65.6000' }),
      road: {
        legs: [{ distanceMetres: 106_600, durationSeconds: 5_160 }],
        nodeIds: [10],
        points: [],
      },
    })
    const valuation = await world.result
    const parcel = valuation.costParcels.find((item) => item.kind === 'toll')

    expect(parcel).toMatchObject({ amount: '65.6000', gap: null, source: 'measured' })
  })

  it('sem lançamento e sem geometria, a lacuna de sempre continua valendo', async () => {
    const world = run({ road: null })
    const valuation = await world.result
    const parcel = valuation.costParcels.find((item) => item.kind === 'toll')

    expect(parcel).toMatchObject({
      amount: '0.0000',
      gap: VALUATION_GAPS.notRecorded,
      source: 'missing',
    })
  })

  /** Rota sem praça é zero calculado, não ausência — a mesma regra da T5/T7, agora na conta. */
  it('rota sem praça é zero calculado, nunca a lacuna de lançamento ausente', async () => {
    const world = run({
      booths: [],
      road: {
        legs: [{ distanceMetres: 50_000, durationSeconds: 3_000 }],
        nodeIds: [1, 2],
        points: [],
      },
    })
    const valuation = await world.result
    const parcel = valuation.costParcels.find((item) => item.kind === 'toll')

    expect(parcel).toMatchObject({ amount: '0.0000', gap: null, source: 'estimated' })
  })

  /** Sem eixo conhecido não há o que calcular — a lacuna de sempre é o que resta. */
  it('sem eixo conhecido, sem lançamento, a lacuna de sempre continua valendo', async () => {
    const world = run({
      booths: [praca(10, '10.50')],
      context: context({
        vehicle: { axles: null, kilometersPerLiter: '2.5000', otherCostsPerKilometer: '0.3000' },
      }),
      road: {
        legs: [{ distanceMetres: 106_600, durationSeconds: 5_160 }],
        nodeIds: [10],
        points: [],
      },
    })
    const valuation = await world.result
    const parcel = valuation.costParcels.find((item) => item.kind === 'toll')

    expect(parcel).toMatchObject({ gap: VALUATION_GAPS.notRecorded, source: 'missing' })
  })

  /**
   * ⚠️ D4: uma única chamada ao roteirizador alimenta distância **e** pedágio — uma segunda
   * chamada poderia discordar da primeira sobre qual foi o caminho.
   */
  it('pega carona na mesma chamada que já buscava a distância, nunca numa segunda', async () => {
    const world = run({
      booths: [praca(10, '10.50')],
      road: {
        legs: [{ distanceMetres: 106_600, durationSeconds: 5_160 }],
        nodeIds: [10],
        points: [],
      },
    })
    await world.result

    expect(world.geometryCalls).toHaveLength(1)
  })
})

describe('praça sem tarifa na parcela calculada (revisão de 2026-09-07)', () => {
  /**
   * ⚠️ O total calculado soma só o que tem tarifa. Com praça desconhecida no meio ele **subestima**,
   * e sair com `gap: null` o apresenta como estimativa completa — o número que a margem usa para
   * dizer se a viagem paga. Medido: 3 das 166 praças não declaram tarifa alguma.
   */
  it('declara a lacuna quando alguma praça do trajeto não tem tarifa conhecida', async () => {
    const { result } = run({
      booths: [praca(10, '10.5000'), { ...praca(20, '0'), chargeCar: null, chargePerAxle: null }],
      road: {
        legs: [{ distanceMetres: 1_000, durationSeconds: 60 }],
        nodeIds: [10, 20],
        points: POINTS,
      },
    })

    const parcela = (await result).costParcels.find((cost) => cost.kind === 'toll')

    expect(parcela?.amount).toBe('21.0000')
    expect(parcela?.gap).toBe('TOLL_PARTIAL')
    expect(parcela?.detail).toBe('1')
  })

  it('não declara lacuna quando toda praça do trajeto tem tarifa', async () => {
    const { result } = run({
      booths: [praca(10, '10.5000')],
      road: {
        legs: [{ distanceMetres: 1_000, durationSeconds: 60 }],
        nodeIds: [10],
        points: POINTS,
      },
    })

    const parcela = (await result).costParcels.find((cost) => cost.kind === 'toll')

    expect(parcela?.gap).toBeNull()
    expect(parcela?.detail).toBeNull()
  })
})
