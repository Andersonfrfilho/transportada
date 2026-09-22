/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import type { RouteGeometryRoad } from '../../src/trips/application/route-geometry.port.js'
import {
  previewTripValuation,
  type TripValuationContext,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import { VALUATION_GAPS } from '../../src/trips/domain/trip-valuation.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const VEHICLE_ID = '00000000-0000-4000-8000-000000000f01'

const POINTS = [
  { latitude: -23.5505, longitude: -46.6333 },
  { latitude: -22.9068, longitude: -43.1729 },
] as const

/** 30 h de estrada medidas pelo roteirizador: mais de um dia, menos de dois inteiros. */
const ROAD: RouteGeometryRoad = {
  legs: [{ distanceMetres: 500_000, durationSeconds: 30 * 3600 }],
  nodeIds: null,
  nodeIdsByLeg: null,
  points: [],
}

function context(overrides: Partial<TripValuationContext> = {}): TripValuationContext {
  return {
    companyDailyAllowanceAmount: '200.0000',
    crew: [{ driverAmount: null, driverId: 'a', driverName: null, paymentModel: 'fixed' }],
    distanceMeters: null,
    documents: [],
    fuelPricePerLiter: '6.0000',
    vehicle: { kilometersPerLiter: '2.5000', otherCostsPerKilometer: '0.3000' },
    ...overrides,
  }
}

function run(
  input: { readonly dailyAllowanceDays?: number; readonly road?: RouteGeometryRoad } = {},
) {
  return previewTripValuation({
    companyId: COMPANY_ID,
    ...(input.dailyAllowanceDays === undefined
      ? {}
      : { dailyAllowanceDays: input.dailyAllowanceDays }),
    driverIds: [],
    geometry: { readRouteGeometry: () => Promise.resolve(input.road ?? null) },
    nfeDocumentIds: ['00000000-0000-4000-8000-000000000c01'],
    repository: {
      findApplicableRule: () => Promise.resolve(null),
      readContext: () => Promise.resolve(null),
      readPreviewContext: () => Promise.resolve(context()),
      readPreviewStopCoordinates: () =>
        Promise.resolve(input.road === undefined ? [] : [...POINTS]),
    },
    stopOrder: [],
    tollBooths: {
      readByNodeIds: () => Promise.resolve([]),
      readCatalogSummary: () => Promise.resolve({ boothCount: 0, latestObservedOn: null }),
    },
    vehicleId: VEHICLE_ID,
  })
}

/**
 * Spec 143 aceite 2/T5: a prévia recebe `dailyAllowanceDays` pela mesma porta que a criação, e
 * vale o mesmo tanto lá quanto cá — é o que impede a margem prometida de divergir da entregue.
 */
describe('a prévia recebe os dias informados (spec 143 T5)', () => {
  it('com dias informados, a parcela do motorista sobe medida pelos dias enviados', async () => {
    const valuation = await run({ dailyAllowanceDays: 2 })
    const driver = valuation.costParcels.find((parcel) => parcel.kind === 'driver')

    /** 200,00/dia × 2 dias = 400,00 — o mesmo número do aceite 2 da spec. */
    expect(driver).toMatchObject({ amount: '400.0000', gap: null, source: 'measured' })
  })

  it('com o roteiro calculado, a duração da estrada vira os dias da prévia', async () => {
    const valuation = await run({ road: ROAD })
    const driver = valuation.costParcels.find((parcel) => parcel.kind === 'driver')

    /** 30 h não cabem num dia: a diária conta o dia começado, 2 × 200,00. */
    expect(driver).toMatchObject({ amount: '400.0000', gap: null, source: 'estimated' })
    expect(driver?.basis).toMatchObject({ days: 2, daysOrigin: 'estimated', of: 'driver' })
  })

  /**
   * ⚠️ Sem roteiro e sem dias informados a prévia **não sabe** quantos dias a viagem paga. Assumir
   * um dia era a resposta errada mais cara da conta: a viagem de três dias saía por um terço do
   * custo do motorista, sem lacuna nenhuma, e a margem chegava ao operador com cara de fechada.
   */
  it('sem roteiro e sem dias informados, a prévia diz que não sabe — nunca um dia calado', async () => {
    const valuation = await run()
    const driver = valuation.costParcels.find((parcel) => parcel.kind === 'driver')

    expect(driver).toMatchObject({
      amount: '0.0000',
      gap: VALUATION_GAPS.noPlannedDuration,
      source: 'missing',
    })
    expect(valuation.hasGaps).toBe(true)
  })
})
