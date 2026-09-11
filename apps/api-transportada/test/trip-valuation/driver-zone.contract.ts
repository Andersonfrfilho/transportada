/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveTripDriverZone,
  type DriverZoneCoverage,
  type RegionCityEntry,
  type TripZoneStop,
} from '../../src/trips/domain/trip-driver-zone.policy.js'

/** O recorte real da tabela do cliente: BARRETOS tem quatro zonas, e os preços delas divergem 39%. */
const CATALOG: readonly RegionCityEntry[] = [
  { city: 'BARRINHA', code: '1.001', regionId: 'r-1001', state: 'SP' },
  { city: 'COLINA', code: '1.003', regionId: 'r-1003', state: 'SP' },
  { city: 'BARRETOS', code: '1.000', regionId: 'r-1000', state: 'SP' },
  { city: 'SÃO CARLOS', code: '2.000', regionId: 'r-2000', state: 'SP' },
]

const COVERS_FAMILY_1: readonly DriverZoneCoverage[] = [
  { city: '', code: '1.003', regionId: 'r-1003', scope: 'region', state: '' },
]

function stop(city: string, sequence: null | number = null): TripZoneStop {
  return { city, sequence, state: 'SP' }
}

/**
 * Spec 127: toda zona decidida carrega `isCoveredByDriver`. É o lembrete de acrescentar a zona na
 * ficha — a cobertura deixou de decidir preço, e as afirmações da 086 que dependiam dela foram
 * reescritas abaixo, cada uma com a razão.
 */
describe('trip driver zone policy', () => {
  /** D1 da 086: a faixa alta da família paga a passagem pelas baixas. */
  test('the price zone is the highest band reached in the route', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: COVERS_FAMILY_1,
        stops: [stop('BARRINHA', 1), stop('COLINA', 2)],
      }),
    ).toEqual({
      isCoveredByDriver: true,
      regionCity: 'COLINA',
      regionCode: '1.003',
      regionId: 'r-1003',
    })
  })

  /**
   * ⚠️ O teste que mediu o defeito da 086. A 127 manteve a propriedade — a ordem de entrada não
   * decide — e trocou o critério: quem decide é a contagem de cidades por rota e a faixa mais alta,
   * não mais a última parada.
   */
  test('the input order never decides', () => {
    const forward = resolveTripDriverZone({
      catalog: CATALOG,
      coverage: COVERS_FAMILY_1,
      stops: [stop('BARRINHA', 1), stop('COLINA', 2)],
    })
    const backward = resolveTripDriverZone({
      catalog: CATALOG,
      coverage: COVERS_FAMILY_1,
      stops: [stop('COLINA', 2), stop('BARRINHA', 1)],
    })

    expect(backward).toEqual(forward)
  })

  /** A grafia da nota não pode decidir se a cidade tem zona (T1). */
  test('the stop matches the catalog through the folded key', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: [{ city: '', code: '2.000', regionId: 'r-2000', scope: 'region', state: '' }],
        stops: [stop('SAO CARLOS', 1)],
      }),
    ).toEqual({
      isCoveredByDriver: true,
      regionCity: 'SÃO CARLOS',
      regionCode: '2.000',
      regionId: 'r-2000',
    })
  })

  /** Uma parada sem endereço resolvível não derruba a viagem: as outras respondem. */
  test('an unresolvable stop does not bring the trip down', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: COVERS_FAMILY_1,
        stops: [stop('COLINA', 1), { city: null, sequence: 2, state: null }],
      }),
    ).toEqual({
      isCoveredByDriver: true,
      regionCity: 'COLINA',
      regionCode: '1.003',
      regionId: 'r-1003',
    })
  })

  /** D2: cidade fora da tabela é sinal com nome, nunca palpite. */
  test('a city outside the table names itself instead of guessing', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: COVERS_FAMILY_1,
        stops: [stop('ITOBI', 1)],
      }),
    ).toEqual({ cityToRegister: 'ITOBI/SP', gap: 'CITY_WITHOUT_REGION' })
  })

  /**
   * Reescrito pela 127 (era "o motorista que não cobre o destino não tem preço"). Decisão do
   * usuário: a cobertura do motorista serve ao roteiro. A zona é a mesma coberta ou não; só o
   * lembrete muda.
   */
  test('the driver who does not cover the destination still has the zone decided', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: [{ city: '', code: '1.001', regionId: 'r-1001', scope: 'region', state: '' }],
        stops: [stop('COLINA', 1)],
      }),
    ).toEqual({
      isCoveredByDriver: false,
      regionCity: 'COLINA',
      regionCode: '1.003',
      regionId: 'r-1003',
    })
  })

  /** A cobertura é acumulativa: quem cobre a 1.003 cobre a 1.001 — e paga o preço da 1.001. */
  test('covering a higher zone pays the price of the zone actually served', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: COVERS_FAMILY_1,
        stops: [stop('BARRINHA', 1)],
      }),
    ).toEqual({
      isCoveredByDriver: true,
      regionCity: 'BARRINHA',
      regionCode: '1.001',
      regionId: 'r-1001',
    })
  })

  /** Cobertura por cidade vale para aquela cidade — para o lembrete, não para o preço (127). */
  test('city-scoped coverage reminds for that city and no other of the zone', () => {
    const coverage: readonly DriverZoneCoverage[] = [
      { city: 'BARRINHA', code: '1.001', regionId: 'r-1001', scope: 'city', state: 'SP' },
    ]

    expect(
      resolveTripDriverZone({ catalog: CATALOG, coverage, stops: [stop('BARRINHA', 1)] }),
    ).toEqual({
      isCoveredByDriver: true,
      regionCity: 'BARRINHA',
      regionCode: '1.001',
      regionId: 'r-1001',
    })
    expect(
      resolveTripDriverZone({ catalog: CATALOG, coverage, stops: [stop('COLINA', 1)] }),
    ).toEqual({
      isCoveredByDriver: false,
      regionCity: 'COLINA',
      regionCode: '1.003',
      regionId: 'r-1003',
    })
  })

  test('without a planned route the highest zone of the family answers', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: COVERS_FAMILY_1,
        stops: [stop('COLINA'), stop('BARRINHA')],
      }),
    ).toEqual({
      isCoveredByDriver: true,
      regionCity: 'COLINA',
      regionCode: '1.003',
      regionId: 'r-1003',
    })
  })

  /**
   * Reescrito pela 127 (era `NO_DRIVER_RATE` seco). Famílias diferentes com o mesmo número de
   * cidades continuam não se desempatando sozinhas, mas agora a lacuna **nomeia** as zonas
   * empatadas — "sem valor" não dizia ao operador entre quais rotas ele tinha de escolher.
   */
  test('two families with the same count is a named tie, never a number', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: [
          ...COVERS_FAMILY_1,
          { city: '', code: '2.000', regionId: 'r-2000', scope: 'region', state: '' },
        ],
        stops: [stop('COLINA'), stop('SÃO CARLOS')],
      }),
    ).toEqual({
      gap: 'DRIVER_ROUTE_AMBIGUOUS',
      tiedZones: [
        { city: 'COLINA', code: '1.003' },
        { city: 'SÃO CARLOS', code: '2.000' },
      ],
    })
  })

  test('a trip without stops has no zone to price', () => {
    expect(
      resolveTripDriverZone({ catalog: CATALOG, coverage: COVERS_FAMILY_1, stops: [] }),
    ).toEqual({ gap: 'NO_DRIVER_RATE' })
  })
})
