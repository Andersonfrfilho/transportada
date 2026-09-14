/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import {
  buildTripDriverCost,
  type TripCrewMember,
} from '../../src/trips/domain/trip-driver-cost.policy.js'
import { chooseTiedZone } from '../../src/trips/domain/trip-driver-tie.policy.js'
import {
  resolveTripDriverZone,
  type RegionCityEntry,
  type TripZoneStop,
} from '../../src/trips/domain/trip-driver-zone.policy.js'
import {
  ADVISORY_GAPS,
  isAdvisoryGap,
  VALUATION_GAPS,
} from '../../src/trips/domain/trip-valuation.policy.js'

/**
 * Spec 128 — **empate de rota usa o maior valor, e a matriz só vale sozinha.**
 *
 * A 127 deixava a parcela sem valor no empate: 5 viagens com motorista somavam R$ 3.231,89 a menos
 * de custo, como se o agregado não recebesse. Decisão do usuário: entre as faixas empatadas vale a de
 * maior preço para a classe, e o detalhe diz quais faixas couberam e quanto cada uma paga.
 */
const CATALOG: readonly RegionCityEntry[] = [
  { city: 'FRANCA', code: '1.003', regionId: 'r-1003', state: 'SP' },
  { city: 'FRANCA', code: '7.001', regionId: 'r-7001', state: 'SP' },
  { city: 'SÃO CARLOS', code: '2.001', regionId: 'r-2001', state: 'SP' },
  { city: 'ARARAQUARA', code: '2.001', regionId: 'r-2001', state: 'SP' },
  { city: 'COLINA', code: '1.002', regionId: 'r-1002', state: 'SP' },
  { city: 'RIBEIRÃO PRETO', code: '0.001', regionId: 'r-0001', state: 'SP' },
  { city: 'RIBEIRÃO PRETO', code: '1.001', regionId: 'r-1001', state: 'SP' },
  { city: 'CRAVINHOS', code: '0.001', regionId: 'r-0001', state: 'SP' },
  { city: 'SERRANA', code: '4.000', regionId: 'r-4000', state: 'SP' },
]

function stop(city: string, sequence: null | number = null): TripZoneStop {
  return { city, sequence, state: 'SP' }
}

/** Toda rotação e inversão: a propriedade vale em cada ordem, sem sorteio que passe por sorte. */
function orderings<T>(items: readonly T[]): readonly (readonly T[])[] {
  const rotations = items.map((_, offset) => [...items.slice(offset), ...items.slice(0, offset)])

  return [...rotations, ...rotations.map((rotation) => [...rotation].reverse())]
}

/** FRANCA + COLINA (rota 1: 2 cidades) contra SÃO CARLOS + ARARAQUARA (rota 2: 2 cidades). */
const TIED_STOPS = [
  stop('FRANCA', 1),
  stop('COLINA', 2),
  stop('SÃO CARLOS', 3),
  stop('ARARAQUARA', 4),
]

function resolveTieInEveryOrder(
  rates: readonly (readonly [string, string])[],
): readonly ReturnType<typeof chooseTiedZone>[] {
  return orderings(CATALOG).flatMap((catalog) =>
    orderings(rates).map((rateOrder) => {
      const zone = resolveTripDriverZone({ catalog, coverage: [], stops: TIED_STOPS })
      if (!('tiedZones' in zone)) throw new Error('expected a tie')

      return chooseTiedZone({ rates: new Map(rateOrder), tiedZones: zone.tiedZones })
    }),
  )
}

describe('a route tie uses the highest price among the tied bands (spec 128)', () => {
  test('the tie is reported with the city count and every tied band', () => {
    expect(resolveTripDriverZone({ catalog: CATALOG, coverage: [], stops: TIED_STOPS })).toEqual({
      cityCount: 2,
      gap: VALUATION_GAPS.driverRouteTieHighestRate,
      tiedZones: [
        { city: 'FRANCA', code: '1.003', isCoveredByDriver: false, regionId: 'r-1003' },
        { city: 'ARARAQUARA', code: '2.001', isCoveredByDriver: false, regionId: 'r-2001' },
      ],
    })
  })

  test('the highest price wins, whatever the order of the catalog and of the rates', () => {
    const results = resolveTieInEveryOrder([
      ['r-1003', '480.0000'],
      ['r-2001', '570.0000'],
    ])

    for (const result of results) {
      expect(result.chosen?.code).toBe('2.001')
      expect(result.chosen?.amount).toBe('570.0000')
      expect(result.zones.map((zone) => [zone.code, zone.amount])).toEqual([
        ['1.003', '480.0000'],
        ['2.001', '570.0000'],
      ])
    }
  })

  /** Comparação de valor, não de texto: `'1100.0000'` < `'990.0000'` como string. */
  test('prices compare as money, not as text', () => {
    const result = chooseTiedZone({
      rates: new Map([
        ['r-1003', '990.0000'],
        ['r-2001', '1100.0000'],
      ]),
      tiedZones: [
        { city: 'COLINA', code: '1.003', isCoveredByDriver: false, regionId: 'r-1003' },
        { city: 'SÃO CARLOS', code: '2.001', isCoveredByDriver: false, regionId: 'r-2001' },
      ],
    })

    expect(result.chosen?.code).toBe('2.001')
  })

  /** O maior valor empatado também: vence o menor código de zona, em toda ordem. */
  test('an equal highest price falls to the lowest zone code, in every order', () => {
    for (const result of resolveTieInEveryOrder([
      ['r-2001', '570.0000'],
      ['r-1003', '570.0000'],
    ])) {
      expect(result.chosen?.code).toBe('1.003')
    }
  })

  test('only one tied band priced: that one is used, and the other is said to have no price', () => {
    for (const result of resolveTieInEveryOrder([['r-2001', '480.0000']])) {
      expect(result.chosen?.code).toBe('2.001')
      expect(result.zones.find((zone) => zone.code === '1.003')?.amount).toBeNull()
    }
  })

  test('no tied band priced: nothing is chosen', () => {
    for (const result of resolveTieInEveryOrder([])) {
      expect(result.chosen).toBeNull()
      expect(result.zones).toHaveLength(2)
    }
  })
})

function member(overrides: Partial<TripCrewMember>): TripCrewMember {
  return {
    cityToRegister: null,
    driverId: 'd-1',
    driverName: null,
    paymentModel: 'route_table',
    regionCity: 'SÃO CARLOS',
    regionCode: '2.001',
    routeAmount: '570.0000',
    routeGap: VALUATION_GAPS.driverRouteTieHighestRate,
    tiedCityCount: 3,
    tiedZones: [
      { amount: '570.0000', city: 'FRANCA', code: '1.003' },
      { amount: '480.0000', city: 'SÃO CARLOS', code: '2.001' },
    ],
    vehicleClass: 'toco',
    ...overrides,
  }
}

describe('the driver parcel of a tie (spec 128, dado cru desde a 129)', () => {
  /**
   * Spec 129: a API não compõe mais a frase — `basis.tie` sai **cru** (código, cidade, decimal em
   * string ou ausência), e `detail` só carrega o nome do condutor (com mais de um na tripulação).
   * A moeda formatada e a palavra "cidades"/"sem preço" são de quem lê a tela.
   */
  test('the parcel carries the value, as measured, with the tie raw in basis', () => {
    const parcel = buildTripDriverCost([member({ regionCity: 'FRANCA', regionCode: '1.003' })])

    expect(parcel.amount).toBe('570.0000')
    expect(parcel.source).toBe('measured')
    expect(parcel.gap).toBe(VALUATION_GAPS.driverRouteTieHighestRate)
    /** Um condutor só: o nome seria ruído, e a lista de faixas mora só em `basis.tie`. */
    expect(parcel.detail).toBeNull()
    expect(parcel.basis).toEqual({
      of: 'driver',
      paymentModel: 'route_table',
      regionCity: 'FRANCA',
      regionCode: '1.003',
      tie: {
        cityCount: 3,
        zones: [
          { amount: '570.0000', city: 'FRANCA', code: '1.003' },
          { amount: '480.0000', city: 'SÃO CARLOS', code: '2.001' },
        ],
      },
      vehicleClass: 'toco',
    })
  })

  test('a tied band without price stays as raw null amount, never a composed word', () => {
    const parcel = buildTripDriverCost([
      member({
        routeAmount: '480.0000',
        tiedZones: [
          { amount: null, city: 'FRANCA', code: '1.003' },
          { amount: '480.0000', city: 'SÃO CARLOS', code: '2.001' },
        ],
      }),
    ])

    expect(parcel.amount).toBe('480.0000')
    expect(parcel.detail).toBeNull()
    expect(parcel.basis).toMatchObject({
      tie: {
        cityCount: 3,
        zones: [
          { amount: null, city: 'FRANCA', code: '1.003' },
          { amount: '480.0000', city: 'SÃO CARLOS', code: '2.001' },
        ],
      },
    })
  })

  /** Nenhuma faixa com preço: a lacuna da 123, com as zonas cruas em `basis.tie` — nunca um texto. */
  test('no tied band priced leaves the parcel missing with the class gap, zones raw in basis', () => {
    const parcel = buildTripDriverCost([
      member({
        regionCity: null,
        regionCode: null,
        routeAmount: null,
        routeGap: VALUATION_GAPS.driverRateMissingForClass,
        tiedZones: [
          { amount: null, city: 'FRANCA', code: '1.003' },
          { amount: null, city: 'SÃO CARLOS', code: '2.001' },
        ],
      }),
    ])

    expect(parcel.source).toBe('missing')
    expect(parcel.gap).toBe(VALUATION_GAPS.driverRateMissingForClass)
    expect(parcel.detail).toBeNull()
    expect(parcel.basis).toEqual({
      of: 'driver',
      paymentModel: 'route_table',
      regionCity: null,
      regionCode: null,
      tie: {
        cityCount: 3,
        zones: [
          { amount: null, city: 'FRANCA', code: '1.003' },
          { amount: null, city: 'SÃO CARLOS', code: '2.001' },
        ],
      },
      vehicleClass: 'toco',
    })
  })

  /** Com mais de um condutor, o único pedaço que sobra em `detail` é o nome de quem é a lacuna. */
  test('with more than one driver, detail names only who the tie gap belongs to', () => {
    const parcel = buildTripDriverCost([
      member({
        driverId: 'd-1',
        driverName: 'eurides dias fontes',
        regionCity: 'FRANCA',
        regionCode: '1.003',
      }),
      { ...member({ driverId: 'd-2', routeAmount: '100.0000' }), routeGap: null },
    ])

    expect(parcel.detail).toBe('eurides dias fontes')
  })

  /** Aviso, não lacuna: o total conta o valor, e a conta não é marcada incompleta. */
  test('the tie advisory does not mark the valuation as incomplete', () => {
    expect(ADVISORY_GAPS).toContain(VALUATION_GAPS.driverRouteTieHighestRate)
    expect(isAdvisoryGap(VALUATION_GAPS.driverRouteTieHighestRate)).toBe(true)
  })

  /** O congelado da 127 ainda carrega o código antigo: ele continua no vocabulário. */
  test('the 127 code stays in the vocabulary for frozen results', () => {
    expect(VALUATION_GAPS.driverRouteAmbiguous).toBe('DRIVER_ROUTE_AMBIGUOUS')
  })
})

describe('the head office only counts alone (spec 128)', () => {
  /** O caso da viagem `157f1822`: só RIBEIRÃO PRETO, na matriz 0.001 e na 1.001. */
  test('a city in the head office and in a route votes only in the route', () => {
    for (const catalog of orderings(CATALOG)) {
      expect(
        resolveTripDriverZone({ catalog, coverage: [], stops: [stop('RIBEIRÃO PRETO', 1)] }),
      ).toEqual({
        isCoveredByDriver: false,
        regionCity: 'RIBEIRÃO PRETO',
        regionCode: '1.001',
        regionId: 'r-1001',
      })
    }
  })

  /** Duas cidades da matriz não vencem uma cidade de rota: a matriz não vota quando há rota. */
  test('the head office does not vote when any route matches', () => {
    expect(
      resolveTripDriverZone({
        catalog: CATALOG,
        coverage: [],
        stops: [stop('CRAVINHOS', 1), stop('RIBEIRÃO PRETO', 2), stop('SERRANA', 3)],
      }),
    ).toEqual({
      cityCount: 1,
      gap: VALUATION_GAPS.driverRouteTieHighestRate,
      tiedZones: [
        { city: 'RIBEIRÃO PRETO', code: '1.001', isCoveredByDriver: false, regionId: 'r-1001' },
        { city: 'SERRANA', code: '4.000', isCoveredByDriver: false, regionId: 'r-4000' },
      ],
    })
  })

  test('the head office is chosen when no other route matches', () => {
    expect(
      resolveTripDriverZone({ catalog: CATALOG, coverage: [], stops: [stop('CRAVINHOS', 1)] }),
    ).toEqual({
      isCoveredByDriver: false,
      regionCity: 'CRAVINHOS',
      regionCode: '0.001',
      regionId: 'r-0001',
    })
  })

  /** Pela família do código, nunca pelo nome: o produto é genérico (ADR-0021). */
  test('the head office is identified by the code family, never by a city name', () => {
    const policy = readFileSync(
      new URL('../../src/trips/domain/trip-driver-zone.policy.ts', import.meta.url),
      'utf8',
    )

    expect(policy).toContain('HEAD_OFFICE_FAMILY')
    expect(policy).not.toMatch(/RIBEIR/i)
  })
})

describe('a trip without a tie does not change (spec 128)', () => {
  test('a single winning route keeps its band and never carries the tie advisory', () => {
    const zone = resolveTripDriverZone({
      catalog: CATALOG,
      coverage: [],
      stops: [stop('FRANCA', 1), stop('COLINA', 2)],
    })

    expect(zone).toEqual({
      isCoveredByDriver: false,
      regionCity: 'FRANCA',
      regionCode: '1.003',
      regionId: 'r-1003',
    })
  })

  test('a priced zone without tie keeps the 127 parcel', () => {
    const parcel = buildTripDriverCost([
      {
        cityToRegister: null,
        driverId: 'd-1',
        driverName: null,
        paymentModel: 'route_table',
        regionCity: 'SÃO CARLOS',
        regionCode: '2.001',
        routeAmount: '570.0000',
        routeGap: null,
        vehicleClass: 'toco',
      },
    ])

    expect(parcel.gap).toBeNull()
    expect(parcel.detail).toBeNull()
    expect(parcel.amount).toBe('570.0000')
  })
})

describe('the crew query prices the tied bands (spec 128)', () => {
  const query = readFileSync(
    new URL('../../src/trips/infrastructure/trip-valuation.query.ts', import.meta.url),
    'utf8',
  )

  test('the tied region ids are priced, and the choice is the domain one', () => {
    expect(query).toContain('chooseTiedZone')
    expect(query).toContain('VALUATION_GAPS.driverRouteTieHighestRate')
  })
})

/**
 * Spec 129 — **a API não compõe frase nem moeda para o empate.** `basis.tie` sai cru
 * (`buildTieBasis`) e `detail` carrega no máximo o nome do condutor (`tieDriverNameDetail`); a
 * palavra "cidade(s)", "sem preço" e o formato de reais são de quem lê a tela — cópia por valor em
 * `tripCostParcelDetail.service.ts` do frontend.
 */
describe('the domain stays raw — no composed word or currency (spec 129)', () => {
  const policy = readFileSync(
    new URL('../../src/trips/domain/trip-driver-cost.policy.ts', import.meta.url),
    'utf8',
  )

  test('no currency literal and no pluralized word ships in the domain', () => {
    /** Fora de comentário: código-fonte não formata moeda nem escreve "sem preço"/"N cidades". */
    const code = policy
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('/**'))
      .join('\n')

    expect(code).not.toContain('R$')
    expect(code).not.toContain('sem preço')
    expect(code).not.toMatch(/cidade(s)?['"`]/i)
    expect(policy).not.toContain('formatFiscalMoney')
  })

  test('the tie raw data lives in basis, not in a composed detail', () => {
    expect(policy).toContain('buildTieBasis')
    expect(policy).toContain('tieDriverNameDetail')
  })
})
