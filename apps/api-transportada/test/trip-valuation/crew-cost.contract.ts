/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 T1.1/T1.2: o custo de tripulação antes e depois da transferência sai das **mesmas**
 * funções puras que a avaliação da viagem usa. O contrato de paridade é o que impede a segunda
 * conta: se `buildCostParcels` e `buildCrewCostParcels` divergirem, o evento grava um número e a
 * tela de custo mostra outro para a mesma tripulação.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildValuationFromContext,
  type TripValuationContext,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import {
  buildCrewCostDifference,
  buildCrewCostParcels,
  summarizeCrewCost,
  type CrewCostInputs,
} from '../../src/trips/domain/trip-crew-cost.policy.js'
import type { TripCrewMember } from '../../src/trips/domain/trip-driver-cost.policy.js'
import type { TripHelperCostMember } from '../../src/trips/domain/trip-helper-cost.policy.js'
import { VALUATION_GAPS } from '../../src/trips/domain/trip-valuation.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const DAY_SECONDS = 86_400

function driver(driverId: string, driverAmount: null | string = null): TripCrewMember {
  return {
    driverAmount,
    driverId,
    driverName: `Motorista ${driverId}`,
    paymentModel: 'route_table',
  }
}

function helper(driverId: string, ownDailyRate: null | string = null): TripHelperCostMember {
  return { driverId, ownDailyRate }
}

function inputs(overrides: Partial<CrewCostInputs> = {}): CrewCostInputs {
  return {
    companyDailyAllowanceAmount: null,
    crew: [driver('a')],
    dailyAllowanceDays: 1,
    estimatedDurationSeconds: null,
    helperCompanyDailyRate: null,
    helperCrew: [],
    journeyIncludesReturn: true,
    journeySeconds: DAY_SECONDS,
    ...overrides,
  }
}

function toContext(crewInputs: CrewCostInputs): TripValuationContext {
  return {
    ...crewInputs,
    distanceMeters: 100_000,
    documents: [],
    fuelPricePerLiter: '6.0000',
    vehicle: { kilometersPerLiter: '2.5000', otherCostsPerKilometer: '0.3000' },
  }
}

async function valuationCrewParcels(crewInputs: CrewCostInputs) {
  const valuation = await buildValuationFromContext({
    companyId: COMPANY_ID,
    context: toContext(crewInputs),
    repository: { findApplicableRule: () => Promise.resolve(null) },
  })

  return valuation.costParcels.filter(
    (parcel) => parcel.kind === 'driver' || parcel.kind === 'helper',
  )
}

function costOf(crewInputs: CrewCostInputs): string {
  return summarizeCrewCost(buildCrewCostParcels(crewInputs)).amount
}

describe('parity with the trip valuation (spec 249 D7)', () => {
  const scenarios: ReadonlyArray<readonly [string, CrewCostInputs]> = [
    ['own allowance', inputs({ crew: [driver('a', '320.0000')], dailyAllowanceDays: 3 })],
    [
      'company allowance',
      inputs({ companyDailyAllowanceAmount: '250.0000', crew: [driver('a'), driver('b')] }),
    ],
    ['default allowance', inputs({ crew: [driver('a')], dailyAllowanceDays: 2 })],
    [
      'helper with and without a rate',
      inputs({
        helperCompanyDailyRate: '90.0000',
        helperCrew: [helper('h1', '120.0000'), helper('h2')],
        journeySeconds: 2 * DAY_SECONDS + 1,
      }),
    ],
    [
      'helper without any rate',
      inputs({ helperCrew: [helper('h1')], journeyIncludesReturn: null }),
    ],
    [
      'helper journey without the way back',
      inputs({ helperCrew: [helper('h1', '100.0000')], journeyIncludesReturn: false }),
    ],
    [
      'unknown duration',
      inputs({ dailyAllowanceDays: null, estimatedDurationSeconds: null, helperCrew: [] }),
    ],
    ['estimated days', inputs({ dailyAllowanceDays: null, estimatedDurationSeconds: 50 * 3600 })],
    ['no driver', inputs({ crew: [] })],
    [
      'helper journey never frozen',
      inputs({ helperCrew: [helper('h1', '80.0000')], journeySeconds: null }),
    ],
  ]

  for (const [name, crewInputs] of scenarios) {
    test(`driver and helper parcels are identical: ${name}`, async () => {
      expect(await valuationCrewParcels(crewInputs)).toEqual([...buildCrewCostParcels(crewInputs)])
    })
  }

  test('returns the driver parcel first, then the helper parcel', () => {
    const parcels = buildCrewCostParcels(inputs({ helperCrew: [helper('h1', '100.0000')] }))

    expect(parcels.map((parcel) => parcel.kind)).toEqual(['driver', 'helper'])
  })
})

describe('the daily allowance origin (spec 143 D3)', () => {
  test('the driver own amount wins over the company amount', () => {
    const crewInputs = inputs({
      companyDailyAllowanceAmount: '250.0000',
      crew: [driver('a', '300.0000')],
      dailyAllowanceDays: 2,
    })

    expect(costOf(crewInputs)).toBe('600.00')
  })

  test('the company amount applies when the driver has none', () => {
    const crewInputs = inputs({
      companyDailyAllowanceAmount: '250.0000',
      crew: [driver('a')],
      dailyAllowanceDays: 2,
    })

    expect(costOf(crewInputs)).toBe('500.00')
  })

  test('the system default applies with neither set', () => {
    expect(costOf(inputs({ crew: [driver('a')], dailyAllowanceDays: 2 }))).toBe('400.00')
  })

  test('informed days win over the estimated duration', () => {
    const crewInputs = inputs({ dailyAllowanceDays: 1, estimatedDurationSeconds: 5 * DAY_SECONDS })

    expect(costOf(crewInputs)).toBe('200.00')
  })

  test('the estimated duration suggests the days when none were informed', () => {
    const crewInputs = inputs({ dailyAllowanceDays: null, estimatedDurationSeconds: 50 * 3600 })

    expect(costOf(crewInputs)).toBe('600.00')
  })

  test('the helper is paid by journey days, with own rate over the company rate', () => {
    const crewInputs = inputs({
      crew: [],
      helperCompanyDailyRate: '90.0000',
      helperCrew: [helper('h1', '120.0000'), helper('h2')],
      journeySeconds: 2 * DAY_SECONDS,
    })

    expect(costOf(crewInputs)).toBe('420.00')
  })
})

describe('summarizeCrewCost', () => {
  test('sums driver and helper in cents', () => {
    const parcels = buildCrewCostParcels(
      inputs({ helperCrew: [helper('h1', '100.0000')], journeySeconds: DAY_SECONDS }),
    )

    expect(summarizeCrewCost(parcels)).toEqual({ amount: '300.00', hasGaps: false })
  })

  test('a helper without a rate is a gap', () => {
    const parcels = buildCrewCostParcels(inputs({ helperCrew: [helper('h1')] }))

    expect(summarizeCrewCost(parcels).hasGaps).toBe(true)
    expect(parcels[1]?.gap).toBe(VALUATION_GAPS.helperDailyRateMissing)
  })

  test('a helper journey without the way back is an advisory, not a gap', () => {
    const parcels = buildCrewCostParcels(
      inputs({ helperCrew: [helper('h1', '100.0000')], journeyIncludesReturn: false }),
    )

    expect(parcels[1]?.gap).toBe(VALUATION_GAPS.helperJourneyWithoutReturn)
    expect(summarizeCrewCost(parcels).hasGaps).toBe(false)
  })

  test('an unknown duration is a gap and costs zero, never one day', () => {
    const parcels = buildCrewCostParcels(
      inputs({ dailyAllowanceDays: null, estimatedDurationSeconds: null }),
    )

    expect(summarizeCrewCost(parcels)).toEqual({ amount: '0.00', hasGaps: true })
  })

  test('rounds the 4-decimal total to 2 places, half up', () => {
    const parcels = buildCrewCostParcels(
      inputs({ crew: [driver('a', '100.0050')], dailyAllowanceDays: 1 }),
    )

    expect(summarizeCrewCost(parcels).amount).toBe('100.01')
  })
})

describe('buildCrewCostDifference (spec 249 D7)', () => {
  function difference(before: CrewCostInputs, after: CrewCostInputs) {
    return buildCrewCostDifference({
      after: summarizeCrewCost(buildCrewCostParcels(after)),
      before: summarizeCrewCost(buildCrewCostParcels(before)),
    })
  }

  test('a dearer crew gives a positive difference', () => {
    const result = difference(
      inputs({ crew: [driver('a', '200.0000')], dailyAllowanceDays: 3 }),
      inputs({ crew: [driver('b', '250.0000')], dailyAllowanceDays: 3 }),
    )

    expect(result).toEqual({
      costAfter: '750.00',
      costBefore: '600.00',
      costDifference: '150.00',
      costHasGaps: false,
    })
  })

  test('a cheaper crew gives a negative difference', () => {
    const result = difference(
      inputs({ crew: [driver('a', '250.0000')], dailyAllowanceDays: 2 }),
      inputs({ crew: [driver('b', '200.0000')], dailyAllowanceDays: 2 }),
    )

    expect(result.costDifference).toBe('-100.00')
  })

  test('the same cost gives zero', () => {
    const same = inputs({ crew: [driver('a')], dailyAllowanceDays: 2 })

    expect(difference(same, same).costDifference).toBe('0.00')
  })

  test('swapping the helper changes only the helper parcel', () => {
    const result = difference(
      inputs({ helperCrew: [helper('h1', '100.0000')], journeySeconds: DAY_SECONDS }),
      inputs({ helperCrew: [helper('h2', '160.0000')], journeySeconds: DAY_SECONDS }),
    )

    expect(result.costDifference).toBe('60.00')
  })

  test('an unknown duration on both sides is difference zero with a gap', () => {
    const unknown = inputs({ dailyAllowanceDays: null, estimatedDurationSeconds: null })
    const result = difference(unknown, { ...unknown, crew: [driver('b', '999.0000')] })

    expect(result).toEqual({
      costAfter: '0.00',
      costBefore: '0.00',
      costDifference: '0.00',
      costHasGaps: true,
    })
  })

  test('a gap on either side marks the event', () => {
    const complete = inputs({ helperCrew: [helper('h1', '100.0000')] })
    const withGap = inputs({ helperCrew: [helper('h2')] })

    expect(difference(complete, withGap).costHasGaps).toBe(true)
    expect(difference(withGap, complete).costHasGaps).toBe(true)
    expect(difference(complete, complete).costHasGaps).toBe(false)
  })

  test('before + difference equals after in cents, rounding each side first', () => {
    const before = inputs({ crew: [driver('a', '100.0050')], dailyAllowanceDays: 1 })
    const after = inputs({ crew: [driver('b', '100.0149')], dailyAllowanceDays: 1 })
    const result = difference(before, after)

    expect(result.costBefore).toBe('100.01')
    expect(result.costAfter).toBe('100.01')
    expect(result.costDifference).toBe('0.00')

    const cents = (value: string): bigint => BigInt(value.replace('.', ''))
    expect(cents(result.costBefore) + cents(result.costDifference)).toBe(cents(result.costAfter))
  })

  test('the sum holds for a negative difference too', () => {
    const result = difference(
      inputs({ crew: [driver('a', '333.3350')], dailyAllowanceDays: 3 }),
      inputs({ crew: [driver('b', '120.1250')], dailyAllowanceDays: 3 }),
    )
    const cents = (value: string): bigint => BigInt(value.replace('.', ''))

    expect(cents(result.costBefore) + cents(result.costDifference)).toBe(cents(result.costAfter))
    expect(result.costDifference.startsWith('-')).toBe(true)
  })
})
