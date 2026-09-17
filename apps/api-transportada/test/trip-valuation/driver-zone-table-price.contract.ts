/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { DAILY_ALLOWANCE_DAYS_ORIGIN } from '../../src/trips/domain/daily-allowance.policy.js'
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
 * Spec 143 — **a zona não precifica mais nada.**
 *
 * A 124 fazia o preço da tabela valer para quem não tinha a zona na ficha, com um lembrete ao lado;
 * a 127 tirou da cobertura o poder de mudar a origem do número. Agora a diária tirou o poder de
 * mudar o número: quem paga é o valor do motorista, o da empresa ou o padrão, e a ficha de regiões
 * serve só para montar o roteiro — que é exatamente o que o usuário disse na 127.
 *
 * ⚠️ `ADVISORY_GAPS` fica como está. Ele é lido por valor no frontend, e resultado congelado antes
 * da 143 ainda carrega o aviso — tirar o código de lá transformaria conta completa em incompleta no
 * histórico.
 */
function member(overrides: Partial<TripCrewMember>): TripCrewMember {
  return {
    driverAmount: null,
    driverId: 'd-1',
    driverName: null,
    paymentModel: 'route_table',
    ...overrides,
  }
}

function buildParcel(crew: readonly TripCrewMember[]) {
  return buildTripDriverCost({
    companyDailyAmount: '450.0000',
    crew,
    days: { of: DAILY_ALLOWANCE_DAYS_ORIGIN.informed, value: 1 },
  })
}

describe('the driver zone no longer prices the trip (spec 143 D1)', () => {
  /** A zona continua decidida e com id — a política fica no repositório (ADR-0066), sem consumidor. */
  test('the uncovered zone still travels with its id', () => {
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

  /** Coberto ou não, o condutor recebe a mesma diária — e a parcela não tem aviso nenhum. */
  test('coverage changes neither the amount nor the gap', () => {
    const parcel = buildParcel([member({})])

    expect(parcel.amount).toBe('450.0000')
    expect(parcel.source).toBe('measured')
    expect(parcel.gap).toBeNull()
    expect(parcel.detail).toBeNull()
  })

  /** Dois condutores, duas diárias: a soma é das linhas, não de uma célula de planilha. */
  test('with two drivers the sum counts both', () => {
    const parcel = buildParcel([
      member({ driverName: 'joana lima' }),
      member({ driverId: 'd-2', driverName: 'adalberto rocha' }),
    ])

    expect(parcel.amount).toBe('900.0000')
    expect(parcel.gap).toBeNull()
  })

  /** O valor próprio do motorista substitui o da empresa, e continua sem aviso. */
  test('the driver own amount replaces the company one with no reminder', () => {
    const parcel = buildParcel([member({ driverAmount: '500.0000' })])

    expect(parcel.amount).toBe('500.0000')
    expect(parcel.gap).toBeNull()
  })

  /** A conta fecha completa: sem lacuna, o total conta o valor inteiro. */
  test('the valuation is complete, with no advisory left to ignore', () => {
    const valuation = buildTripValuation({
      costParcels: [buildParcel([member({})])],
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
   * ⚠️ Os dois avisos **permanecem** na lista, mesmo sem ninguém os produzir: o frontend copia
   * `ADVISORY_GAPS` por valor, e uma parcela congelada com o aviso precisa continuar sendo lida como
   * conta completa.
   */
  test('the advisory gaps stay exactly as they were', () => {
    expect(ADVISORY_GAPS).toEqual([
      VALUATION_GAPS.driverZonePricedFromTable,
      VALUATION_GAPS.driverRouteTieHighestRate,
    ])
  })

  /**
   * A consulta não acende mais o lembrete: a T4 apagou `resolveCrew` inteiro (a zona não mora mais
   * ali), então a afirmação vale para o arquivo todo, não mais para um método que não existe.
   */
  test('the crew query no longer raises the reminder', () => {
    const source = readFileSync(
      new URL('../../src/trips/infrastructure/trip-valuation.query.ts', import.meta.url),
      'utf8',
    )

    expect(source).not.toContain('private async resolveCrew')
    expect(source).not.toContain('VALUATION_GAPS.driverZonePricedFromTable')
    expect(source).not.toContain('zone.isCoveredByDriver')
  })
})
