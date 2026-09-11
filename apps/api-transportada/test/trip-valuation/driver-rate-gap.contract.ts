/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

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
 * Spec 123 — **a lacuna do agregado diz qual célula da planilha falta.**
 *
 * `NO_DRIVER_RATE` saía com `detail: null`, então a tela imprimia "rota do agregado sem valor
 * cadastrado" e nada mais. Numa planilha de 29 zonas × 6 colunas, isso é mandar o operador
 * conferir 174 células. O que o cálculo já sabia no momento da lacuna — a zona casada, a coluna do
 * veículo e de qual motorista é a falta — morria dentro da consulta.
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

describe('the driver rate gap names the spreadsheet cell (spec 123)', () => {
  /**
   * D1: **as duas faltas se distinguem sem consulta nova.** A zona casou e o motorista não a cobre
   * — isso se resolve na ficha dele. A política já tinha a zona na mão quando recusou a cobertura;
   * ela só a jogava fora.
   */
  test('an uncovered destination reports the zone it refused', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: COVERS_FAMILY_1,
        stops: [{ city: 'CAJURU', sequence: 1, state: 'SP' }],
      }),
    ).toEqual({
      gap: VALUATION_GAPS.driverZoneNotCovered,
      regionCity: 'CAJURU',
      regionCode: '3.000',
      regionId: 'r-3000',
    })
  })

  /** Sem destino algum não há zona para nomear, e a frase seca de sempre permanece. */
  test('with no destination at all the dry gap stays', () => {
    expect(
      resolveTripDriverZone({ catalog: CATALOG, coverage: COVERS_FAMILY_1, stops: [] }),
    ).toEqual({ gap: VALUATION_GAPS.noDriverRate })
  })

  /** D2: zona e classe conhecidas saem **as duas** no detalhe — a linha e a coluna da planilha. */
  test('a known zone and class publish both in the detail', () => {
    const parcel = buildTripDriverCost([
      member({
        regionCity: 'RIBEIRAO PRETO',
        regionCode: '1.002',
        routeGap: VALUATION_GAPS.driverRateMissingForClass,
        vehicleClass: 'toco',
      }),
    ])

    expect(parcel.gap).toBe(VALUATION_GAPS.driverRateMissingForClass)
    expect(parcel.detail).toBe('1.002 (RIBEIRAO PRETO) · toco')
    expect(parcel.amount).toBe('0.0000')
  })

  /**
   * D3: **o detalhe encolhe, nunca adivinha.** Cavalo mecânico não é coluna da planilha
   * (`resolveVehicleFreightClass` manda `''`), então a classe some do texto em vez de virar um
   * rótulo inventado.
   */
  test('an unknown piece shrinks the detail instead of being invented', () => {
    const parcel = buildTripDriverCost([
      member({ regionCity: 'CAJURU', regionCode: '3.000', vehicleClass: '' }),
    ])

    expect(parcel.detail).toBe('3.000 (CAJURU)')
  })

  /** Nada conhecido é o comportamento de sempre: frase seca, `detail` nulo. */
  test('with nothing known the detail stays null', () => {
    expect(buildTripDriverCost([member({})]).detail).toBeNull()
    expect(buildTripDriverCost([member({})]).gap).toBe(VALUATION_GAPS.noDriverRate)
  })

  /**
   * ⚠️ **Uma coordenada só não localiza célula.** Sem zona decidida — nenhuma parada com cidade —,
   * imprimir "three_quarter" diria que o problema é a coluna, e o problema é que não houve destino.
   * Medido: quatro das vinte viagens reais com tripulação caem exatamente aqui.
   */
  test('the class never appears without the zone', () => {
    expect(buildTripDriverCost([member({ vehicleClass: 'three_quarter' })]).detail).toBeNull()
  })

  /**
   * D4: **com mais de um tripulante, o detalhe diz de quem é a lacuna.** Sem o nome o operador
   * confere o cadastro errado — é o defeito conhecido de eleger um tripulante para reportar.
   */
  test('with two drivers the detail names the one that is missing', () => {
    const parcel = buildTripDriverCost([
      member({
        driverId: 'd-1',
        driverName: 'eurides dias fontes',
        regionCity: 'CAJURU',
        regionCode: '3.000',
        routeGap: VALUATION_GAPS.driverZoneNotCovered,
        vehicleClass: 'three_quarter',
      }),
      member({ driverId: 'd-2', driverName: 'cleiton marques de sá', routeAmount: '570.0000' }),
    ])

    expect(parcel.detail).toBe('3.000 (CAJURU) · three_quarter · eurides dias fontes')
  })

  /** Com um só condutor o nome é ruído: não há de quem confundir. */
  test('a single driver is not named', () => {
    const parcel = buildTripDriverCost([
      member({ driverName: 'eurides dias fontes', regionCity: 'CAJURU', regionCode: '3.000' }),
    ])

    expect(parcel.detail).toBe('3.000 (CAJURU)')
  })

  /**
   * A cidade a cadastrar continua vencendo e continua saindo **sozinha**: "cadastre ITOBI/SP" é a
   * ação, e a spec 086 D2 já a decidiu. Acrescentar zona ao lado seria contraditório — não há zona.
   */
  test('the city to register still wins and stays alone', () => {
    const parcel = buildTripDriverCost([
      member({ regionCity: 'CAJURU', regionCode: '3.000', vehicleClass: 'toco' }),
      member({
        cityToRegister: 'ITOBI/SP',
        driverId: 'd-2',
        routeGap: VALUATION_GAPS.cityWithoutRegion,
      }),
    ])

    expect(parcel.gap).toBe(VALUATION_GAPS.cityWithoutRegion)
    expect(parcel.detail).toBe('ITOBI/SP')
  })

  /**
   * ⚠️ **Nenhum número muda.** A spec 123 mexe no texto da lacuna, não na conta: a parcela sem
   * valor continua valendo zero, e a que tem valor continua somando igual.
   */
  test('the arithmetic is untouched', () => {
    const measured = buildTripDriverCost([
      member({
        driverName: 'cleiton marques de sá',
        regionCity: 'RIBEIRAO PRETO',
        regionCode: '1.001',
        routeAmount: '380.0000',
        vehicleClass: 'toco',
      }),
      member({ driverId: 'd-2', routeAmount: '570.0000' }),
    ])

    expect(measured.amount).toBe('950.0000')
    expect(measured.gap).toBeNull()
    expect(measured.detail).toBeNull()
    expect(measured.source).toBe('measured')
  })
})

const query = readFileSync(
  new URL('../../src/trips/infrastructure/trip-valuation.query.ts', import.meta.url),
  'utf8',
)

/**
 * Por texto de fonte pelo mesmo motivo do contrato de fiação da 086: a consulta fala com o
 * Postgres, e descartar um campo que ela já tinha na mão compila e passa em todo caminho feliz.
 */
describe('the query carries what the gap needs (spec 123)', () => {
  test('the driver name crosses from the query into the crew', () => {
    expect(query).toInclude('driverName')
    expect(query).toInclude('fleetDrivers.name')
  })

  test('a resolved zone with no price says the class cell is empty', () => {
    expect(query).toInclude('driverRateMissingForClass')
  })

  /** Sem coluna na planilha não existe "célula vazia": ali a lacuna genérica é a honesta. */
  test('a vehicle without a spreadsheet column keeps the generic gap', () => {
    expect(query).toInclude('noDriverRate')
  })
})
