/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import {
  buildTripDriverCost,
  type TripCrewMember,
} from '../../src/trips/domain/trip-driver-cost.policy.js'
import { resolveTripDriverZone } from '../../src/trips/domain/trip-driver-zone.policy.js'
import {
  ADVISORY_GAPS,
  buildTripValuation,
  VALUATION_GAPS,
} from '../../src/trips/domain/trip-valuation.policy.js'

/**
 * Spec 124 — **motorista sem a zona: a conta usa o preço da tabela, e avisa.**
 *
 * A 123 fazia a parcela do agregado sair ausente quando o destino caía numa zona que o motorista
 * não cobre. O preço da célula `(zona, classe)` existe; o que falta é a linha de cobertura na ficha.
 * A conta passa a usar o preço, marcado como estimado, com o aviso de acrescentar a zona.
 */
function member(overrides: Partial<TripCrewMember>): TripCrewMember {
  return {
    cityToRegister: null,
    driverId: 'd-1',
    driverName: null,
    paymentModel: 'route_table',
    regionCity: null,
    regionCode: null,
    routeAmount: null,
    routeGap: null,
    vehicleClass: '',
    ...overrides,
  }
}

const PRICED_FROM_TABLE = {
  regionCity: 'CAJURU',
  regionCode: '3.000',
  routeAmount: '450.0000',
  routeGap: VALUATION_GAPS.driverZonePricedFromTable,
  routeSource: 'estimated',
  vehicleClass: 'vuc',
} as const

describe('uncovered zone priced from the table (spec 124)', () => {
  /** Sem o id da zona recusada, a consulta não tem como pedir o preço dela à tabela. */
  test('the refused zone travels with its id', () => {
    expect(
      resolveTripDriverZone({
        catalog: [{ city: 'CAJURU', code: '3.000', regionId: 'r-3000', state: 'SP' }],
        coverage: [{ city: '', code: '1.003', regionId: 'r-1003', scope: 'region', state: '' }],
        stops: [{ city: 'CAJURU', sequence: 1, state: 'SP' }],
      }),
    ).toEqual({
      gap: VALUATION_GAPS.driverZoneNotCovered,
      regionCity: 'CAJURU',
      regionCode: '3.000',
      regionId: 'r-3000',
    })
  })

  test('the table price counts, marked as estimated, with the advisory naming the cell', () => {
    const parcel = buildTripDriverCost([member(PRICED_FROM_TABLE)])

    expect(parcel.amount).toBe('450.0000')
    expect(parcel.source).toBe('estimated')
    expect(parcel.gap).toBe(VALUATION_GAPS.driverZonePricedFromTable)
    expect(parcel.detail).toBe('3.000 (CAJURU) · vuc')
  })

  /** D3: a soma conta os dois, e o aviso é de quem não cobre — não do primeiro da lista. */
  test('with two drivers the sum counts both and the advisory names the uncovered one', () => {
    const parcel = buildTripDriverCost([
      member({
        driverId: 'd-1',
        driverName: 'joana lima',
        regionCity: 'CAJURU',
        regionCode: '3.000',
        routeAmount: '450.0000',
        vehicleClass: 'vuc',
      }),
      member({ ...PRICED_FROM_TABLE, driverId: 'd-2', driverName: 'adalberto rocha' }),
    ])

    expect(parcel.amount).toBe('900.0000')
    expect(parcel.source).toBe('estimated')
    expect(parcel.detail).toBe('3.000 (CAJURU) · vuc · adalberto rocha')
  })

  /** Regra 2: sem preço nem na tabela, nada é inventado — a lacuna da 123 continua. */
  test('without a price anywhere the parcel stays missing', () => {
    const parcel = buildTripDriverCost([
      member(PRICED_FROM_TABLE),
      member({
        driverId: 'd-2',
        regionCity: 'CAJURU',
        regionCode: '3.000',
        routeGap: VALUATION_GAPS.driverZoneNotCovered,
        vehicleClass: 'vuc',
      }),
    ])

    expect(parcel.source).toBe('missing')
    expect(parcel.amount).toBe('0.0000')
    expect(parcel.gap).toBe(VALUATION_GAPS.driverZoneNotCovered)
  })

  /** Regra 5: coberto, o mesmo preço sai medido e sem aviso. */
  test('a covered zone keeps the measured parcel without advisory', () => {
    const parcel = buildTripDriverCost([
      member({ regionCode: '3.000', routeAmount: '450.0000', vehicleClass: 'vuc' }),
    ])

    expect(parcel.source).toBe('measured')
    expect(parcel.gap).toBeNull()
  })

  /** D4: com assalariado junto, o aviso acionável vence a marca de período. */
  test('the advisory wins over the salaried mark', () => {
    const parcel = buildTripDriverCost([
      member(PRICED_FROM_TABLE),
      member({ driverId: 'd-2', paymentModel: 'fixed' }),
    ])

    expect(parcel.gap).toBe(VALUATION_GAPS.driverZonePricedFromTable)
    expect(parcel.amount).toBe('450.0000')
  })

  /** D2: o aviso não torna a conta incompleta — o total conta o valor. */
  test('an advisory gap does not mark the valuation as incomplete', () => {
    const valuation = buildTripValuation({
      costParcels: [buildTripDriverCost([member(PRICED_FROM_TABLE)])],
      revenueLines: [
        {
          amount: '1000.0000',
          freightRuleId: null,
          freightRuleName: null,
          gap: null,
          nfeDocumentId: 'n-1',
          percentage: null,
          source: 'measured',
          tripDocumentId: 't-1',
        },
      ],
    })

    expect(valuation.hasGaps).toBe(false)
    expect(valuation.totalCost).toBe('450.0000')
  })

  /** `TOLL_PARTIAL` subestima de verdade — ele não é aviso, e continua marcando a conta. */
  test('only the table-priced zone is advisory', () => {
    expect(ADVISORY_GAPS).toEqual([VALUATION_GAPS.driverZonePricedFromTable])
  })

  /** A consulta pede à tabela o preço também da zona recusada — é a fiação que a regra 1 exige. */
  test('the crew query prices the refused zone too', () => {
    const source = readFileSync(
      new URL('../../src/trips/infrastructure/trip-valuation.query.ts', import.meta.url),
      'utf8',
    )
    const resolveCrew = source.slice(source.indexOf('private async resolveCrew'))

    expect(resolveCrew).toContain('VALUATION_GAPS.driverZonePricedFromTable')
    expect(resolveCrew).toContain("routeSource: 'estimated'")
  })
})
