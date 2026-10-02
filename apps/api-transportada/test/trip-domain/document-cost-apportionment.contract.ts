/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 225. O custo da viagem não muda: ele se divide. Por isso quase todo teste aqui termina na
 * mesma pergunta — a soma das notas fecha com o total? — e os que não terminam nela são os que
 * provam que distância, tempo e espera entraram de verdade na conta.
 */
import { describe, expect, test } from 'bun:test'

import {
  apportionDocumentCosts,
  COST_KIND_APPORTIONMENT,
} from '../../src/trips/domain/document-cost-apportionment.policy.js'
import {
  APPORTIONMENT_BASES,
  DWELL_BASES,
} from '../../src/trips/domain/document-cost-apportionment.types.js'
import type {
  ApportionDocumentCostsParams,
  ApportionmentCostParcel,
  ApportionmentDocument,
  ApportionmentStop,
  DwellBasis,
} from '../../src/trips/domain/document-cost-apportionment.types.js'
import { TRIP_COST_KINDS } from '../../src/trips/domain/trip-valuation.policy.js'

const TEN_KILOMETRES = 10_000
const ONE_HOUR = 3_600

function stop(
  id: string,
  dwellSeconds = 0,
  dwellBasis: DwellBasis = DWELL_BASES.measured,
): ApportionmentStop {
  return { dwellBasis, dwellSeconds, id }
}

function note(tripDocumentId: string, stopId: null | string, freightAmount = '100.0000') {
  return { freightAmount, stopId, tripDocumentId } satisfies ApportionmentDocument
}

function parcel(kind: ApportionmentCostParcel['kind'], amount: null | string) {
  return { amount, kind } satisfies ApportionmentCostParcel
}

/** Três paradas, trechos iguais, retorno de 30 km. Cinco notas: duas, duas e uma. */
function buildScenario(
  overrides: Partial<ApportionDocumentCostsParams> = {},
): ApportionDocumentCostsParams {
  return {
    costParcels: [
      parcel('fuel', '300.0000'),
      parcel('driver', '240.0000'),
      parcel('manual', '60.0000'),
      parcel('icms', '100.0000'),
    ],
    documents: [
      note('doc-1', 'stop-1'),
      note('doc-2', 'stop-1'),
      note('doc-3', 'stop-2'),
      note('doc-4', 'stop-2'),
      note('doc-5', 'stop-3'),
    ],
    legs: [
      { distanceMetres: TEN_KILOMETRES, durationSeconds: ONE_HOUR },
      { distanceMetres: TEN_KILOMETRES, durationSeconds: ONE_HOUR },
      { distanceMetres: TEN_KILOMETRES, durationSeconds: ONE_HOUR },
    ],
    returnDistanceMetres: 30_000,
    stops: [stop('stop-1'), stop('stop-2'), stop('stop-3')],
    ...overrides,
  }
}

function sumOf(values: readonly (null | string)[]): number {
  return values.reduce((total, value) => total + Number(value ?? 0), 0)
}

function figuresById(params: ApportionDocumentCostsParams) {
  return new Map(
    apportionDocumentCosts(params).documents.map((figures) => [figures.tripDocumentId, figures]),
  )
}

describe('classificação das parcelas de custo (spec 225 D1)', () => {
  test('toda parcela que o domínio conhece tem critério declarado', () => {
    const missing = TRIP_COST_KINDS.filter((kind) => COST_KIND_APPORTIONMENT[kind] === undefined)

    expect(missing).toEqual([])
  })

  test('o critério de cada parcela é o da tabela do D1, nome por nome', () => {
    expect(COST_KIND_APPORTIONMENT).toEqual({
      delivery_charges: APPORTIONMENT_BASES.distance,
      driver: APPORTIONMENT_BASES.time,
      fuel: APPORTIONMENT_BASES.distance,
      helper: APPORTIONMENT_BASES.time,
      icms: APPORTIONMENT_BASES.revenue,
      manual: APPORTIONMENT_BASES.tripShare,
      other_per_kilometer: APPORTIONMENT_BASES.distance,
      pis_cofins: APPORTIONMENT_BASES.revenue,
      toll: APPORTIONMENT_BASES.distance,
    })
  })
})

describe('a soma das notas fecha com a viagem (spec 225 D4, CA01)', () => {
  test('custo mais imposto somam o total das parcelas, ao centavo', () => {
    const figures = apportionDocumentCosts(buildScenario()).documents

    const total =
      sumOf(figures.map((entry) => entry.costAmount)) +
      sumOf(figures.map((entry) => entry.taxAmount))

    expect(total).toBeCloseTo(700, 4)
  })

  test('o frete por nota soma a receita, e a margem soma receita menos total', () => {
    const figures = apportionDocumentCosts(buildScenario()).documents

    expect(sumOf(figures.map((entry) => entry.freightAmount))).toBeCloseTo(500, 4)
    expect(sumOf(figures.map((entry) => entry.marginAmount))).toBeCloseTo(500 - 700, 4)
  })

  test('cada nota tem trecho e rateio somando o próprio custo', () => {
    for (const entry of apportionDocumentCosts(buildScenario()).documents) {
      expect(Number(entry.legCostAmount) + Number(entry.tripShareCostAmount)).toBeCloseTo(
        Number(entry.costAmount),
        4,
      )
    }
  })

  test('nenhum centavo órfão: a diferença vai para a nota de maior gasto', () => {
    // 100 reais de combustível em três notas a bordo de trechos iguais não divide redondo.
    const figures = apportionDocumentCosts(
      buildScenario({
        costParcels: [parcel('fuel', '100.0000')],
        documents: [note('doc-1', 'stop-1'), note('doc-2', 'stop-2'), note('doc-3', 'stop-3')],
        returnDistanceMetres: null,
      }),
    ).documents

    expect(sumOf(figures.map((entry) => entry.costAmount))).toBeCloseTo(100, 4)
  })
})

describe('distância e tempo entram na conta (spec 225 CA02)', () => {
  test('nota da primeira parada gasta menos que nota da última, com o mesmo frete', () => {
    const figures = figuresById(buildScenario())

    expect(Number(figures.get('doc-1')?.costAmount)).toBeLessThan(
      Number(figures.get('doc-5')?.costAmount),
    )
  })

  test('nota a bordo de mais trechos acumula mais gasto de trecho', () => {
    const figures = figuresById(buildScenario())

    expect(Number(figures.get('doc-1')?.legCostAmount)).toBeLessThan(
      Number(figures.get('doc-3')?.legCostAmount),
    )
    expect(Number(figures.get('doc-3')?.legCostAmount)).toBeLessThan(
      Number(figures.get('doc-5')?.legCostAmount),
    )
  })
})

describe('o retorno não desaparece (spec 225 D3, CA03)', () => {
  test('com retorno, toda nota recebe rateio de viagem maior que zero', () => {
    for (const entry of apportionDocumentCosts(buildScenario()).documents) {
      expect(Number(entry.tripShareCostAmount)).toBeGreaterThan(0)
    }
  })

  test('sem retorno e sem avulso, o rateio de viagem é zero e a soma continua fechando', () => {
    const figures = apportionDocumentCosts(
      buildScenario({
        costParcels: [parcel('fuel', '300.0000')],
        returnDistanceMetres: null,
      }),
    ).documents

    expect(sumOf(figures.map((entry) => entry.tripShareCostAmount))).toBeCloseTo(0, 4)
    expect(sumOf(figures.map((entry) => entry.costAmount))).toBeCloseTo(300, 4)
  })
})

describe('espera no cliente (spec 225 D9, CA03b)', () => {
  const waitingScenario = buildScenario({
    costParcels: [parcel('driver', '240.0000')],
    documents: [note('doc-1', 'stop-1'), note('doc-2', 'stop-2'), note('doc-3', 'stop-3')],
    returnDistanceMetres: null,
    stops: [stop('stop-1', ONE_HOUR), stop('stop-2'), stop('stop-3')],
  })

  test('a parada que esperou mais encarece a nota dela', () => {
    const figures = figuresById(waitingScenario)

    expect(Number(figures.get('doc-1')?.costAmount)).toBeGreaterThan(
      Number(figures.get('doc-2')?.costAmount),
    )
  })

  test('a espera não vaza para quem não desceu ali: a soma continua sendo o total', () => {
    const figures = apportionDocumentCosts(waitingScenario).documents

    expect(sumOf(figures.map((entry) => entry.costAmount))).toBeCloseTo(240, 4)
  })

  test('duas notas na mesma parada dividem a espera, e o total não cresce', () => {
    const shared = apportionDocumentCosts({
      ...waitingScenario,
      documents: [note('doc-1', 'stop-1'), note('doc-2', 'stop-1'), note('doc-3', 'stop-3')],
    }).documents
    const figures = new Map(shared.map((entry) => [entry.tripDocumentId, entry]))

    expect(Number(figures.get('doc-1')?.costAmount)).toBeCloseTo(
      Number(figures.get('doc-2')?.costAmount),
      4,
    )
    expect(sumOf(shared.map((entry) => entry.costAmount))).toBeCloseTo(240, 4)
  })

  test('sem `departed`, o tempo sai parcial', () => {
    const figures = apportionDocumentCosts({
      ...waitingScenario,
      stops: [stop('stop-1', ONE_HOUR, DWELL_BASES.proxy), stop('stop-2'), stop('stop-3')],
    }).documents

    expect(figures.every((entry) => entry.timeBasis === 'partial')).toBeTrue()
  })

  test('sem `arrived`, a espera é zero e o tempo sai incompleto — nunca um palpite', () => {
    const figures = apportionDocumentCosts({
      ...waitingScenario,
      stops: [stop('stop-1', 0, DWELL_BASES.unknown), stop('stop-2'), stop('stop-3')],
    }).documents
    const byId = new Map(figures.map((entry) => [entry.tripDocumentId, entry]))

    expect(figures.every((entry) => entry.timeBasis === 'incomplete')).toBeTrue()
    // Sem espera medida, as três notas se separam só pelos trechos.
    expect(Number(byId.get('doc-1')?.costAmount)).toBeLessThan(
      Number(byId.get('doc-3')?.costAmount),
    )
  })

  test('com tudo medido, o tempo sai completo', () => {
    const figures = apportionDocumentCosts(waitingScenario).documents

    expect(figures.every((entry) => entry.timeBasis === 'complete')).toBeTrue()
  })
})

describe('balde sem peso nenhum não desaparece (revisão da 225, A1)', () => {
  /**
   * Gêmeo do defeito do D3: com todos os trechos e o retorno em zero metro, o balde de distância não
   * tem peso nenhum para se repartir. `delivery_charges` e o pedágio lançado à mão não dependem da
   * quilometragem, então esse dinheiro existe e tem de ir para algum lugar — o rateio da viagem.
   */
  test('trechos e retorno de zero metro mandam o balde de distância para o rateio', () => {
    const params = buildScenario({
      costParcels: [
        parcel('fuel', '50.0000'),
        parcel('driver', '200.0000'),
        parcel('delivery_charges', '30.0000'),
        parcel('icms', '12.0000'),
        parcel('manual', '7.0000'),
      ],
      documents: [note('doc-1', 'stop-1'), note('doc-2', 'stop-2')],
      legs: [
        { distanceMetres: 0, durationSeconds: 100 },
        { distanceMetres: 0, durationSeconds: 100 },
      ],
      returnDistanceMetres: 0,
      stops: [stop('stop-1'), stop('stop-2')],
    })

    const figures = apportionDocumentCosts(params).documents
    const total =
      sumOf(figures.map((entry) => entry.costAmount)) +
      sumOf(figures.map((entry) => entry.taxAmount))

    expect(total).toBeCloseTo(299, 4)
  })

  test('retorno nulo, em vez de zero, se comporta igual', () => {
    const figures = apportionDocumentCosts(
      buildScenario({
        costParcels: [parcel('fuel', '50.0000'), parcel('delivery_charges', '30.0000')],
        documents: [note('doc-1', 'stop-1'), note('doc-2', 'stop-2')],
        legs: [
          { distanceMetres: 0, durationSeconds: 100 },
          { distanceMetres: 0, durationSeconds: 100 },
        ],
        returnDistanceMetres: null,
        stops: [stop('stop-1'), stop('stop-2')],
      }),
    ).documents

    expect(sumOf(figures.map((entry) => entry.costAmount))).toBeCloseTo(80, 4)
  })

  /**
   * A rede de segurança: se a soma de conferência não fechar por qualquer razão — hoje, frete total
   * zero com imposto positivo faz o balde de imposto não ter para quem descer —, a resposta é
   * "indisponível", nunca um número que parece conta e não fecha.
   */
  test('soma que não fecha vira indisponível, não número errado', () => {
    const figures = apportionDocumentCosts(
      buildScenario({
        costParcels: [parcel('fuel', '50.0000'), parcel('icms', '12.0000')],
        documents: [note('doc-1', 'stop-1', '0.0000'), note('doc-2', 'stop-2', '0.0000')],
        stops: [stop('stop-1'), stop('stop-2')],
        legs: [
          { distanceMetres: TEN_KILOMETRES, durationSeconds: ONE_HOUR },
          { distanceMetres: TEN_KILOMETRES, durationSeconds: ONE_HOUR },
        ],
      }),
    ).documents

    expect(figures.every((entry) => entry.costBasis === 'unavailable')).toBeTrue()
    expect(figures.every((entry) => entry.costAmount === null)).toBeTrue()
  })
})

describe('sem roteiro não há número inventado (spec 225 D5, CA04 e CA05)', () => {
  test('sem trechos, toda nota sai indisponível e sem valor', () => {
    const figures = apportionDocumentCosts(buildScenario({ legs: [] })).documents

    expect(figures.every((entry) => entry.costBasis === 'unavailable')).toBeTrue()
    expect(figures.every((entry) => entry.costAmount === null)).toBeTrue()
    expect(figures.every((entry) => entry.marginAmount === null)).toBeTrue()
    expect(figures.every((entry) => entry.marginPercentage === null)).toBeTrue()
  })

  test('o frete continua sendo dito mesmo sem roteiro', () => {
    const figures = apportionDocumentCosts(buildScenario({ legs: [] })).documents

    expect(figures.every((entry) => entry.freightAmount === '100.0000')).toBeTrue()
  })

  test('contagem de trechos diferente da de paradas é ausência, não aproximação', () => {
    const figures = apportionDocumentCosts(
      buildScenario({
        legs: [{ distanceMetres: TEN_KILOMETRES, durationSeconds: ONE_HOUR }],
      }),
    ).documents

    expect(figures.every((entry) => entry.costBasis === 'unavailable')).toBeTrue()
  })
})

describe('casos extremos (spec 225)', () => {
  test('nota sem parada não recebe trecho, só rateio de viagem (CA06)', () => {
    const figures = figuresById(
      buildScenario({
        documents: [note('doc-1', 'stop-1'), note('doc-2', null)],
      }),
    )

    expect(Number(figures.get('doc-2')?.legCostAmount)).toBeCloseTo(0, 4)
    expect(Number(figures.get('doc-2')?.tripShareCostAmount)).toBeGreaterThan(0)
  })

  test('viagem com uma nota só: todo o custo vai para ela, retorno incluído', () => {
    const figures = apportionDocumentCosts(
      buildScenario({ documents: [note('doc-1', 'stop-3')] }),
    ).documents

    expect(
      sumOf(figures.map((entry) => entry.costAmount)) +
        sumOf(figures.map((entry) => entry.taxAmount)),
    ).toBeCloseTo(700, 4)
  })

  test('viagem sem nota não quebra, e devolve lista vazia', () => {
    expect(apportionDocumentCosts(buildScenario({ documents: [] })).documents).toEqual([])
  })

  test('trecho de duração zero não divide por zero: o custo de tempo vai ao rateio', () => {
    const figures = apportionDocumentCosts(
      buildScenario({
        costParcels: [parcel('driver', '240.0000')],
        legs: [
          { distanceMetres: TEN_KILOMETRES, durationSeconds: 0 },
          { distanceMetres: TEN_KILOMETRES, durationSeconds: 0 },
          { distanceMetres: TEN_KILOMETRES, durationSeconds: 0 },
        ],
        returnDistanceMetres: null,
        stops: [stop('stop-1'), stop('stop-2'), stop('stop-3')],
      }),
    ).documents

    expect(sumOf(figures.map((entry) => entry.costAmount))).toBeCloseTo(240, 4)
  })

  test('parcela nula é ausência de lançamento, não zero que soma errado', () => {
    const figures = apportionDocumentCosts(
      buildScenario({ costParcels: [parcel('fuel', '300.0000'), parcel('manual', null)] }),
    ).documents

    expect(sumOf(figures.map((entry) => entry.costAmount))).toBeCloseTo(300, 4)
  })
})
