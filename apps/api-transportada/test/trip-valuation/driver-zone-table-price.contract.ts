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
 * ⚠️ Reescrito pela spec 127. A 124 contava o preço como `estimated` quando a ficha do motorista
 * não cobria a zona. Decisão do usuário na 127: "as regiões dos motoristas são só para ajudar a
 * montar o roteiro" — a cobertura não decide preço **nem origem**. O preço é o da tabela para
 * `(zona, classe)`, `measured`; o aviso de acrescentar a zona na ficha continua, só como lembrete.
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
  vehicleClass: 'vuc',
} as const

describe('uncovered zone priced from the table (spec 124, semantics of 127)', () => {
  /** A zona fora da ficha continua decidida e com id: é dela que a consulta pede o preço. */
  test('the uncovered zone travels with its id', () => {
    expect(
      resolveTripDriverZone({
        catalog: [{ city: 'CAJURU', code: '3.000', regionId: 'r-3000', state: 'SP' }],
        coverage: [{ city: '', code: '1.003', regionId: 'r-1003', scope: 'region', state: '' }],
        stops: [{ city: 'CAJURU', sequence: 1, state: 'SP' }],
      }),
    ).toEqual({
      isCoveredByDriver: false,
      regionCity: 'CAJURU',
      regionCode: '3.000',
      regionId: 'r-3000',
    })
  })

  /** Era "marcado como estimado": a 127 tirou da ficha o poder de mudar a origem do número. */
  test('the table price counts as measured, with the reminder naming the cell', () => {
    const parcel = buildTripDriverCost([member(PRICED_FROM_TABLE)])

    expect(parcel.amount).toBe('450.0000')
    expect(parcel.source).toBe('measured')
    expect(parcel.gap).toBe(VALUATION_GAPS.driverZonePricedFromTable)
    expect(parcel.detail).toBe('3.000 (CAJURU) · vuc')
  })

  /** D3: a soma conta os dois, e o lembrete é de quem não cobre — não do primeiro da lista. */
  test('with two drivers the sum counts both and the reminder names the uncovered one', () => {
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
    expect(parcel.source).toBe('measured')
    expect(parcel.detail).toBe('3.000 (CAJURU) · vuc · adalberto rocha')
  })

  /**
   * Regra 2: sem preço na tabela, nada é inventado. Na 127 a lacuna é a da célula
   * (`DRIVER_RATE_MISSING_FOR_CLASS`, spec 123) — coberta ou não, é a planilha que falta.
   */
  test('without a price in the table the parcel stays missing', () => {
    const parcel = buildTripDriverCost([
      member(PRICED_FROM_TABLE),
      member({
        driverId: 'd-2',
        regionCity: 'CAJURU',
        regionCode: '3.000',
        routeGap: VALUATION_GAPS.driverRateMissingForClass,
        vehicleClass: 'vuc',
      }),
    ])

    expect(parcel.source).toBe('missing')
    expect(parcel.amount).toBe('0.0000')
    expect(parcel.gap).toBe(VALUATION_GAPS.driverRateMissingForClass)
  })

  /** Regra 5: coberto, o mesmo preço sai sem lembrete — e com a mesma origem. */
  test('a covered zone keeps the same parcel without the reminder', () => {
    const parcel = buildTripDriverCost([
      member({ regionCode: '3.000', routeAmount: '450.0000', vehicleClass: 'vuc' }),
    ])

    expect(parcel.source).toBe('measured')
    expect(parcel.gap).toBeNull()
  })

  /** D4: com assalariado junto, o lembrete acionável vence a marca de período. */
  test('the reminder wins over the salaried mark', () => {
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

  /**
   * `TOLL_PARTIAL` subestima de verdade — ele não é aviso, e continua marcando a conta. Reescrito
   * pela 128: o empate de rotas com o maior valor também é aviso (o número é o da tabela, completo).
   */
  test('only the table-priced zone and the priced route tie are advisory', () => {
    expect(ADVISORY_GAPS).toEqual([
      VALUATION_GAPS.driverZonePricedFromTable,
      VALUATION_GAPS.driverRouteTieHighestRate,
    ])
  })

  /** A consulta acende o lembrete pela cobertura, e só por ela — sem trocar a origem do valor. */
  test('the crew query raises the reminder from coverage alone', () => {
    const source = readFileSync(
      new URL('../../src/trips/infrastructure/trip-valuation.query.ts', import.meta.url),
      'utf8',
    )
    const resolveCrew = source.slice(source.indexOf('private async resolveCrew'))

    expect(resolveCrew).toContain('VALUATION_GAPS.driverZonePricedFromTable')
    expect(resolveCrew).toContain('zone.isCoveredByDriver')
    expect(resolveCrew).not.toContain("routeSource: 'estimated'")
  })
})
