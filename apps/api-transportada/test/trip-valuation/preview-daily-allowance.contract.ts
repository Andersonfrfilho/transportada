/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  previewTripValuation,
  type TripValuationContext,
} from '../../src/trips/application/read-trip-valuation.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const VEHICLE_ID = '00000000-0000-4000-8000-000000000f01'

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

function run(dailyAllowanceDays?: number) {
  return previewTripValuation({
    companyId: COMPANY_ID,
    ...(dailyAllowanceDays === undefined ? {} : { dailyAllowanceDays }),
    driverIds: [],
    geometry: { readRouteGeometry: () => Promise.resolve(null) },
    nfeDocumentIds: ['00000000-0000-4000-8000-000000000c01'],
    repository: {
      findApplicableRule: () => Promise.resolve(null),
      readContext: () => Promise.resolve(null),
      readPreviewContext: () => Promise.resolve(context()),
      readPreviewStopCoordinates: () => Promise.resolve([]),
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
    const valuation = await run(2)
    const driver = valuation.costParcels.find((parcel) => parcel.kind === 'driver')

    /** 200,00/dia × 2 dias = 400,00 — o mesmo número do aceite 2 da spec. */
    expect(driver).toMatchObject({ amount: '400.0000', gap: null, source: 'measured' })
  })

  it('sem dias informados, a parcela nasce prevista pela duração estimada', async () => {
    const valuation = await run()
    const driver = valuation.costParcels.find((parcel) => parcel.kind === 'driver')

    expect(driver?.source).toBe('estimated')
  })
})
