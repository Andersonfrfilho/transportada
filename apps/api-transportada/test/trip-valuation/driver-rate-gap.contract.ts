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
import {
  resolveTripDriverZone,
  type DriverZoneCoverage,
  type RegionCityEntry,
} from '../../src/trips/domain/trip-driver-zone.policy.js'
import { VALUATION_GAPS } from '../../src/trips/domain/trip-valuation.policy.js'

/**
 * Spec 143 — **a lacuna do agregado acabou junto com a tabela de região.**
 *
 * A 123 fez `NO_DRIVER_RATE` nomear a célula da planilha que faltava, porque o operador tinha o que
 * cadastrar. Com a diária não há célula: sem valor próprio paga a empresa, sem a empresa paga o
 * padrão do sistema. Este contrato guarda o inverso do que guardava — nenhum caminho do custo de
 * motorista produz aquelas lacunas — e o que a 123 provou sobre o **texto** delas morreu com elas.
 *
 * ⚠️ Os códigos continuam existindo: resultado congelado antes da 143 guarda o antigo em `note`, e
 * a tela ainda precisa traduzi-lo. Quem prova isso é `valuation-gap-labels.contract.ts`, no
 * frontend.
 */
const CATALOG: readonly RegionCityEntry[] = [
  { city: 'RIBEIRAO PRETO', code: '1.002', regionId: 'r-1002', state: 'SP' },
  { city: 'CAJURU', code: '3.000', regionId: 'r-3000', state: 'SP' },
]

const COVERS_FAMILY_1: readonly DriverZoneCoverage[] = [
  { city: '', code: '1.003', regionId: 'r-1003', scope: 'region', state: '' },
]

function member(overrides: Partial<TripCrewMember>): TripCrewMember {
  return {
    driverAmount: null,
    driverId: 'd-1',
    driverName: null,
    paymentModel: 'route_table',
    ...overrides,
  }
}

function buildParcel(crew: readonly TripCrewMember[], companyDailyAmount: null | string = null) {
  return buildTripDriverCost({
    companyDailyAmount,
    crew,
    days: { of: DAILY_ALLOWANCE_DAYS_ORIGIN.informed, value: 1 },
  })
}

describe('no route gap reaches the driver parcel any more (spec 143 D1)', () => {
  /**
   * O destino que a ficha do motorista não cobre era o caso que abria o lembrete da 127. A zona
   * ainda resolve — a política fica no repositório, registrada na ADR-0066 —, mas nada do que ela
   * devolve entra na conta.
   */
  test('an uncovered destination no longer changes the driver cost', () => {
    const zone = resolveTripDriverZone({
      catalog: CATALOG,
      coverage: COVERS_FAMILY_1,
      stops: [{ city: 'CAJURU', sequence: 1, state: 'SP' }],
    })
    const parcel = buildParcel([member({})])

    expect(zone).toEqual({
      isCoveredByDriver: false,
      regionCity: 'CAJURU',
      regionCode: '3.000',
      regionId: 'r-3000',
    })
    expect(parcel.gap).toBeNull()
    expect(parcel.amount).toBe('200.0000')
  })

  /** Sem destino algum a viagem não tinha zona — e hoje isso também não segura a diária. */
  test('with no destination at all the driver is still paid', () => {
    expect(
      resolveTripDriverZone({ catalog: CATALOG, coverage: COVERS_FAMILY_1, stops: [] }),
    ).toEqual({ gap: VALUATION_GAPS.noDriverRate })
    expect(buildParcel([member({})], '180.0000').gap).toBeNull()
  })

  /**
   * ⚠️ **A parcela não tem mais o que nomear.** `detail` existia para apontar a célula da planilha;
   * sem planilha, compor texto aqui seria inventar explicação para um número que já se explica em
   * `basis.crew[]`.
   */
  test('the parcel carries no detail, with one driver or with two', () => {
    expect(buildParcel([member({ driverName: 'eurides dias fontes' })]).detail).toBeNull()
    expect(
      buildParcel([
        member({ driverName: 'eurides dias fontes' }),
        member({ driverId: 'd-2', driverName: 'cleiton marques de sá' }),
      ]).detail,
    ).toBeNull()
  })

  /** A tripulação inteira recebe: dois condutores, duas linhas, e o total é a soma delas. */
  test('every crew member is paid, whatever the payment model', () => {
    const parcel = buildParcel(
      [
        member({ driverName: 'eurides dias fontes' }),
        member({ driverId: 'd-2', driverName: 'cleiton marques de sá', paymentModel: 'fixed' }),
      ],
      '180.0000',
    )

    expect(parcel.amount).toBe('360.0000')
    expect(parcel.gap).toBeNull()
    expect(parcel.source).toBe('measured')
  })
})

const query = readFileSync(
  new URL('../../src/trips/infrastructure/trip-valuation.query.ts', import.meta.url),
  'utf8',
)

/**
 * Por texto de fonte pelo mesmo motivo do contrato de fiação da 086: a consulta fala com o
 * Postgres, e um campo descartado ali compila e passa em todo caminho feliz.
 */
describe('the query stopped producing the rate gaps (spec 143 D1)', () => {
  test('the driver name still crosses from the query into the crew', () => {
    expect(query).toInclude('driverName')
    expect(query).toInclude('fleetDrivers.name')
  })

  /** Nenhuma das duas lacunas de preço nasce mais da consulta — não há preço de rota para faltar. */
  test('no rate gap is produced any more', () => {
    expect(query).not.toInclude('driverRateMissingForClass')
    expect(query).not.toInclude('VALUATION_GAPS.noDriverRate')
  })
})
