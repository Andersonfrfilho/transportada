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

describe('trip driver zone policy', () => {
  /**
   * D1: **a zona é a do último destino, o mais distante.** Uma saída, um pagamento — o preço da zona
   * alta já paga a passagem pelas baixas, que é o que a coluna OBSERVAÇÃO da planilha diz.
   */
  test('the price zone is the last stop of the planned route', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: COVERS_FAMILY_1,
        stops: [stop('BARRINHA', 1), stop('COLINA', 2)],
      }),
    ).toEqual({ regionCity: 'COLINA', regionCode: '1.003', regionId: 'r-1003' })
  })

  /**
   * ⚠️ **O teste que mede o defeito.** Hoje a consulta fica com a primeira linha que trouxer valor,
   * então inverter a ordem de entrada muda o preço — 1.086,12 contra 1.508,51 na mesma viagem.
   * A ordem de **entrada** não decide nada; quem decide é `sequence`.
   */
  test('the input order never decides — only the sequence does', () => {
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
    expect(backward).toEqual({ regionCity: 'COLINA', regionCode: '1.003', regionId: 'r-1003' })
  })

  /** A grafia da nota não pode decidir se a cidade tem zona (T1). */
  test('the stop matches the catalog through the folded key', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: [{ city: '', code: '2.000', regionId: 'r-2000', scope: 'region', state: '' }],
        stops: [stop('SAO CARLOS', 1)],
      }),
    ).toEqual({ regionCity: 'SÃO CARLOS', regionCode: '2.000', regionId: 'r-2000' })
  })

  /** Uma parada sem endereço resolvível não derruba a viagem: a anterior responde. */
  test('an unresolvable last stop falls back to the one before it', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: COVERS_FAMILY_1,
        stops: [stop('COLINA', 1), { city: null, sequence: 2, state: null }],
      }),
    ).toEqual({ regionCity: 'COLINA', regionCode: '1.003', regionId: 'r-1003' })
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

  test('the driver who does not cover the destination has no price', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: [{ city: '', code: '1.001', regionId: 'r-1001', scope: 'region', state: '' }],
        stops: [stop('COLINA', 1)],
      }),
    ).toEqual({ gap: 'NO_DRIVER_RATE' })
  })

  /** A cobertura é acumulativa: quem cobre a 1.003 cobre a 1.001 — e paga o preço da 1.001. */
  test('covering a higher zone pays the price of the zone actually served', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: COVERS_FAMILY_1,
        stops: [stop('BARRINHA', 1)],
      }),
    ).toEqual({ regionCity: 'BARRINHA', regionCode: '1.001', regionId: 'r-1001' })
  })

  /** Cobertura por cidade vale para aquela cidade, não para a zona inteira. */
  test('city-scoped coverage serves that city and no other of the zone', () => {
    const coverage: readonly DriverZoneCoverage[] = [
      { city: 'BARRINHA', code: '1.001', regionId: 'r-1001', scope: 'city', state: 'SP' },
    ]

    expect(
      resolveTripDriverZone({ catalog: CATALOG, coverage, stops: [stop('BARRINHA', 1)] }),
    ).toEqual({ regionCity: 'BARRINHA', regionCode: '1.001', regionId: 'r-1001' })
    expect(
      resolveTripDriverZone({ catalog: CATALOG, coverage, stops: [stop('COLINA', 1)] }),
    ).toEqual({ gap: 'NO_DRIVER_RATE' })
  })

  /**
   * Sem roteiro planejado não há "mais distante" calculável. A regra é a zona mais alta da família,
   * que é o que a acumulação já significa — assumido, não perguntado, e registrado na spec.
   */
  test('without a planned route the highest zone of the family answers', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: COVERS_FAMILY_1,
        stops: [stop('COLINA'), stop('BARRINHA')],
      }),
    ).toEqual({ regionCity: 'COLINA', regionCode: '1.003', regionId: 'r-1003' })
  })

  /** Famílias diferentes sem ordem não se desempatam sozinhas. */
  test('two families without order is a gap, never a number', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: [
          ...COVERS_FAMILY_1,
          { city: '', code: '2.000', regionId: 'r-2000', scope: 'region', state: '' },
        ],
        stops: [stop('COLINA'), stop('SÃO CARLOS')],
      }),
    ).toEqual({ gap: 'NO_DRIVER_RATE' })
  })

  test('a trip without stops has no zone to price', () => {
    expect(
      resolveTripDriverZone({ catalog: CATALOG, coverage: COVERS_FAMILY_1, stops: [] }),
    ).toEqual({ gap: 'NO_DRIVER_RATE' })
  })
})
