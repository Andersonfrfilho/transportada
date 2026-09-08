/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 090 T11: a viagem já criada lê o pedágio **congelado** no momento do planejamento — nunca
 * recalcula, e o lançamento manual continua vencendo sempre que existir (mesma decisão da T9).
 */
import { describe, expect, it } from 'bun:test'

import { readTripValuation } from '../../src/trips/application/read-trip-valuation.use-case.js'
import type {
  TripValuationContext,
  TripValuationPort,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import type { TollRouteCost } from '../../src/toll-booths/domain/toll-route-cost.policy.js'
import { VALUATION_GAPS } from '../../src/trips/domain/trip-valuation.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000b01'

function frozenToll(overrides: Partial<TollRouteCost> = {}): TollRouteCost {
  return {
    axles: { count: 2, source: 'declared' },
    /** Toco: dois eixos de rodagem dupla, Categoria 2 — multiplicador 2. */
    multiplier: { denominator: 1, numerator: 2 },
    booths: [],
    boothsFallenBackToManual: 0,
    boothsWithoutCharge: 0,
    chargePerAxle: '32.8000',
    paymentMode: 'manual',
    total: '65.6000',
    ...overrides,
  }
}

function context(overrides: Partial<TripValuationContext> = {}): TripValuationContext {
  return {
    distanceMeters: null,
    documents: [],
    fuelPricePerLiter: null,
    toll: null,
    tollTotal: null,
    vehicle: { kilometersPerLiter: null, otherCostsPerKilometer: null },
    ...overrides,
  }
}

function createPort(readContextResult: TripValuationContext | null): TripValuationPort {
  return {
    findApplicableRule: () => Promise.resolve(null),
    readContext: () => Promise.resolve(readContextResult),
  }
}

describe('pedágio congelado na viagem já criada (spec 090 T11)', () => {
  it('usa o congelado quando ninguém lançou nada à mão', async () => {
    const valuation = await readTripValuation({
      companyId: COMPANY_ID,
      repository: createPort(context({ toll: frozenToll() })),
      tripId: TRIP_ID,
    })

    const parcel = valuation.costParcels.find((item) => item.kind === 'toll')
    expect(parcel).toMatchObject({ amount: '65.6000', gap: null, source: 'estimated' })
  })

  it('lançamento manual vence o congelado, mesmo com os dois presentes', async () => {
    const valuation = await readTripValuation({
      companyId: COMPANY_ID,
      repository: createPort(context({ toll: frozenToll(), tollTotal: '70.0000' })),
      tripId: TRIP_ID,
    })

    const parcel = valuation.costParcels.find((item) => item.kind === 'toll')
    expect(parcel).toMatchObject({ amount: '70.0000', gap: null, source: 'measured' })
  })

  it('congelado com praça sem tarifa mantém a lacuna TOLL_PARTIAL', async () => {
    const valuation = await readTripValuation({
      companyId: COMPANY_ID,
      repository: createPort(context({ toll: frozenToll({ boothsWithoutCharge: 1 }) })),
      tripId: TRIP_ID,
    })

    const parcel = valuation.costParcels.find((item) => item.kind === 'toll')
    expect(parcel?.gap).toBe(VALUATION_GAPS.tollPartial)
    expect(parcel?.detail).toBe('1')
  })

  it('sem congelado e sem lançamento, a lacuna de sempre continua valendo', async () => {
    const valuation = await readTripValuation({
      companyId: COMPANY_ID,
      repository: createPort(context()),
      tripId: TRIP_ID,
    })

    const parcel = valuation.costParcels.find((item) => item.kind === 'toll')
    expect(parcel).toMatchObject({
      amount: '0.0000',
      gap: VALUATION_GAPS.notRecorded,
      source: 'missing',
    })
  })
})
