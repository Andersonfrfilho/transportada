/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import {
  DAILY_ALLOWANCE_DAYS_ORIGIN,
  DAILY_ALLOWANCE_RATE_ORIGIN,
} from '../../src/trips/domain/daily-allowance.policy.js'
import {
  buildTripDriverCost,
  type TripCrewMember,
} from '../../src/trips/domain/trip-driver-cost.policy.js'
import {
  resolveTripDriverZone,
  type DriverZoneCoverage,
  type RegionCityEntry,
  type TripZoneStop,
} from '../../src/trips/domain/trip-driver-zone.policy.js'
import { VALUATION_GAPS } from '../../src/trips/domain/trip-valuation.policy.js'

/**
 * Spec 127 — **a rota é a que casa com mais cidades da viagem.**
 *
 * `resolveTripDriverZone` montava o catálogo como `Map<cidade, linha>`, e uma cidade em duas rotas
 * (legítimo: a unicidade é `(company_id, region_id, city, state)`) era **sobrescrita** — vencia a
 * última linha que o Postgres devolveu, e a outra rota sumia sem aviso. Na planilha real FRANCA/SP
 * está na 1.003 e na 7.001, e BARRINHA/SP na 1.000 e na 5.000.
 *
 * A regra do usuário: cada cidade da viagem vota em toda rota em que aparece; vence a rota com mais
 * cidades distintas; a faixa é a mais alta alcançada dentro dela; empate é lacuna com nome. A
 * cobertura do motorista serve ao roteiro — não decide preço nem origem.
 */
const CATALOG: readonly RegionCityEntry[] = [
  { city: 'FRANCA', code: '1.003', regionId: 'r-1003', state: 'SP' },
  { city: 'FRANCA', code: '7.001', regionId: 'r-7001', state: 'SP' },
  { city: 'COLINA', code: '1.003', regionId: 'r-1003', state: 'SP' },
  { city: 'BARRINHA', code: '1.000', regionId: 'r-1000', state: 'SP' },
  { city: 'BARRINHA', code: '5.000', regionId: 'r-5000', state: 'SP' },
  { city: 'ITUVERAVA', code: '7.002', regionId: 'r-7002', state: 'SP' },
  { city: 'SERTÃOZINHO', code: '1.001', regionId: 'r-1001', state: 'SP' },
]

function stop(city: string, sequence: null | number = null): TripZoneStop {
  return { city, sequence, state: 'SP' }
}

/**
 * Todas as ordens que o Postgres poderia devolver, sem sorteio: a propriedade tem de valer em cada
 * uma, e um teste com `Math.random` passaria por sorte no dia em que a ordem ruim não saísse.
 */
function orderings<T>(items: readonly T[]): readonly (readonly T[])[] {
  const rotations = items.map((_, offset) => [...items.slice(offset), ...items.slice(0, offset)])

  return [...rotations, ...rotations.map((rotation) => [...rotation].reverse())]
}

function resolveInEveryOrder(input: {
  readonly coverage?: readonly DriverZoneCoverage[]
  readonly stops: readonly TripZoneStop[]
}): readonly ReturnType<typeof resolveTripDriverZone>[] {
  return orderings(CATALOG).map((catalog) =>
    resolveTripDriverZone({ catalog, coverage: input.coverage ?? [], stops: input.stops }),
  )
}

describe('the route that matches more trip cities wins (spec 127)', () => {
  /** ⚠️ O teste que mede o defeito: com o `Map` sobrescrito, uma das ordens perdia a rota 1. */
  test('the catalog order never decides the route', () => {
    const results = resolveInEveryOrder({ stops: [stop('FRANCA', 1), stop('COLINA', 2)] })

    for (const result of results) {
      expect(result).toEqual({
        isCoveredByDriver: false,
        regionCity: 'COLINA',
        regionCode: '1.003',
        regionId: 'r-1003',
      })
    }
  })

  /**
   * A cidade em duas rotas vota **nas duas**: com FRANCA + ITUVERAVA a rota 7 tem duas cidades e a
   * 1 tem uma. Se FRANCA votasse só numa, a 7 empataria ou perderia.
   */
  test('a city listed in two routes votes in both', () => {
    for (const result of resolveInEveryOrder({
      stops: [stop('FRANCA', 1), stop('ITUVERAVA', 2)],
    })) {
      expect(result).toEqual({
        isCoveredByDriver: false,
        regionCity: 'ITUVERAVA',
        regionCode: '7.002',
        regionId: 'r-7002',
      })
    }
  })

  /** A faixa é a mais alta alcançada dentro da rota vencedora (D1 da 086), não a da última parada. */
  test('the band is the highest one reached inside the winning route', () => {
    for (const result of resolveInEveryOrder({
      stops: [stop('COLINA', 1), stop('SERTÃOZINHO', 2), stop('BARRINHA', 3)],
    })) {
      expect(result).toEqual({
        isCoveredByDriver: false,
        regionCity: 'COLINA',
        regionCode: '1.003',
        regionId: 'r-1003',
      })
    }
  })

  /** Parada cuja cidade não está na rota vencedora não puxa faixa dela — nem uma faixa mais alta. */
  test('a stop outside the winning route does not pull its band', () => {
    for (const result of resolveInEveryOrder({
      stops: [stop('COLINA', 1), stop('SERTÃOZINHO', 2), stop('ITUVERAVA', 3)],
    })) {
      expect(result).toEqual({
        isCoveredByDriver: false,
        regionCity: 'COLINA',
        regionCode: '1.003',
        regionId: 'r-1003',
      })
    }
  })

  /**
   * Empate real não se escolhe pela ordem: as zonas empatadas saem nomeadas, código e cidade.
   * Reescrito pela 128 — deixou de ser lacuna sem valor; a política devolve as faixas com id e
   * cobertura, e a consulta fica com a de maior preço (`driver-route-tie.contract.ts`).
   */
  test('a real tie names the tied zones, in every catalog order', () => {
    for (const result of resolveInEveryOrder({ stops: [stop('FRANCA', 1)] })) {
      expect(result).toEqual({
        cityCount: 1,
        gap: VALUATION_GAPS.driverRouteTieHighestRate,
        tiedZones: [
          { city: 'FRANCA', code: '1.003', isCoveredByDriver: false, regionId: 'r-1003' },
          { city: 'FRANCA', code: '7.001', isCoveredByDriver: false, regionId: 'r-7001' },
        ],
      })
    }
  })

  /** A ordem do roteiro também não desempata: rota é contagem de cidades, não a última parada. */
  test('two routes with one city each tie even with a planned sequence', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: [],
        stops: [stop('SERTÃOZINHO', 1), stop('ITUVERAVA', 2)],
      }),
    ).toEqual({
      cityCount: 1,
      gap: VALUATION_GAPS.driverRouteTieHighestRate,
      tiedZones: [
        { city: 'SERTÃOZINHO', code: '1.001', isCoveredByDriver: false, regionId: 'r-1001' },
        { city: 'ITUVERAVA', code: '7.002', isCoveredByDriver: false, regionId: 'r-7002' },
      ],
    })
  })

  /**
   * A cobertura do motorista **não** decide zona: cobrir a 7 não puxa a viagem para a 7, e não
   * cobrir nada não a tira da 1. Ela só acende o lembrete.
   */
  test('driver coverage changes neither the zone nor the price, only the reminder', () => {
    const stops = [stop('FRANCA', 1), stop('COLINA', 2)]
    const uncovered = resolveTripDriverZone({ catalog: CATALOG, coverage: [], stops })
    const coversOther = resolveTripDriverZone({
      catalog: CATALOG,
      coverage: [{ city: '', code: '7.001', regionId: 'r-7001', scope: 'region', state: '' }],
      stops,
    })
    const covers = resolveTripDriverZone({
      catalog: CATALOG,
      coverage: [{ city: '', code: '1.003', regionId: 'r-1003', scope: 'region', state: '' }],
      stops,
    })

    expect(coversOther).toEqual(uncovered)
    expect(covers).toEqual({ ...uncovered, isCoveredByDriver: true })
  })
})

function member(overrides: Partial<TripCrewMember>): TripCrewMember {
  return {
    driverAmount: '570.0000',
    driverId: 'd-1',
    driverName: null,
    paymentModel: 'route_table',
    ...overrides,
  }
}

/**
 * Spec 143 — **a votação decide o roteiro, não o preço.** Antes, a rota vencedora escolhia a célula
 * da tabela de região e a célula virava a parcela; agora a parcela é a diária de cada condutor, e
 * nenhuma cidade da viagem vota nela. O que a 127 corrigiu continua valendo para a zona (acima).
 */
describe('the driver parcel no longer depends on the vote (spec 143 D1)', () => {
  test('the zone of the trip changes neither the amount nor the gap', () => {
    const parcel = buildTripDriverCost({
      companyDailyAmount: null,
      crew: [member({})],
      days: { of: DAILY_ALLOWANCE_DAYS_ORIGIN.informed, value: 1 },
    })

    expect(parcel.amount).toBe('570.0000')
    expect(parcel.source).toBe('measured')
    expect(parcel.gap).toBeNull()
    expect(parcel.detail).toBeNull()
  })

  /**
   * O empate sem nenhuma faixa com preço era a parcela sem valor da 128; hoje o motorista sem valor
   * próprio cai no valor da empresa, e uma viagem com condutor nunca fica sem número.
   */
  test('a crew member with no own amount is paid by the company, never left without value', () => {
    const parcel = buildTripDriverCost({
      companyDailyAmount: '190.0000',
      crew: [member({ driverAmount: null })],
      days: { of: DAILY_ALLOWANCE_DAYS_ORIGIN.informed, value: 2 },
    })

    expect(parcel.source).toBe('measured')
    expect(parcel.amount).toBe('380.0000')
    expect(parcel.gap).toBeNull()
    expect(parcel.basis).toEqual({
      crew: [
        {
          dailyAmount: '190.0000',
          driverId: 'd-1',
          driverName: null,
          paymentModel: 'route_table',
          rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.company,
          subtotal: '380.0000',
        },
      ],
      days: 2,
      daysOrigin: DAILY_ALLOWANCE_DAYS_ORIGIN.informed,
      of: 'driver',
    })
  })
})

const query = readFileSync(
  new URL('../../src/trips/infrastructure/trip-valuation.query.ts', import.meta.url),
  'utf8',
)
const zonePolicy = readFileSync(
  new URL('../../src/trips/domain/trip-driver-zone.policy.ts', import.meta.url),
  'utf8',
)

/** Por texto de fonte: a consulta fala com o Postgres, e o ramo errado compila igual. */
describe('the crew query under the vote (spec 127)', () => {
  /** Sem cobertura e sem preço, a lacuna é a da célula (123), não "ajuste a ficha". */
  test('the query no longer produces the not-covered gap', () => {
    expect(query).not.toInclude('driverZoneNotCovered')
    expect(zonePolicy).not.toInclude('driverZoneNotCovered')
  })

  test('the query never marks the table price as estimated for lack of coverage', () => {
    expect(query).not.toInclude("routeSource: 'estimated'")
  })

  /** Spec 143: as faixas empatadas param na política de zona — a tripulação não as recebe mais. */
  test('the tied zones no longer cross into the crew', () => {
    expect(query).not.toInclude('tiedZones')
  })

  /** O `Map` de uma linha por cidade é o defeito; ele não pode voltar. */
  test('the catalog keeps every route of a city', () => {
    expect(zonePolicy).not.toInclude(
      'new Map(input.catalog.map((entry) => [cityKey(entry), entry]))',
    )
  })
})
