/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { buildTripDriverCost } from '../../src/trips/domain/trip-driver-cost.policy.js'
import { buildTripTaxParcels } from '../../src/trips/domain/trip-tax.policy.js'

const AGGREGATE = { driverId: 'a', paymentModel: 'route_table' as const, routeAmount: '812.4500' }
const SALARIED = { driverId: 'b', paymentModel: 'fixed' as const, routeAmount: null }

/**
 * Spec 086 T5: **a lacuna do agregado passou a ter duas causas, e elas pedem ações diferentes.**
 * "este motorista não cobre esta zona" se resolve na ficha dele; "ITOBI/SP não está na tabela de
 * regiões" se resolve na aba Regiões. Uma lacuna só mandava o operador procurar no lugar errado
 * metade das vezes, e o nome da cidade é o que transforma o aviso em ação.
 */
describe('a causa da lacuna do agregado (spec 086)', () => {
  test('a cidade fora da tabela sobe por nome, não como falta de cadastro do motorista', () => {
    expect(
      buildTripDriverCost([
        {
          cityToRegister: 'ITOBI/SP',
          driverId: 'a',
          paymentModel: 'route_table',
          routeAmount: null,
          routeGap: 'CITY_WITHOUT_REGION',
        },
      ]),
    ).toEqual({
      amount: '0.0000',
      detail: 'ITOBI/SP',
      gap: 'CITY_WITHOUT_REGION',
      kind: 'driver',
      source: 'missing',
    })
  })

  /** Sem causa declarada, a lacuna continua sendo a de sempre — nada muda para quem já funcionava. */
  test('sem causa declarada, segue NO_DRIVER_RATE', () => {
    expect(
      buildTripDriverCost([{ driverId: 'a', paymentModel: 'route_table', routeAmount: null }]),
    ).toMatchObject({ detail: null, gap: 'NO_DRIVER_RATE' })
  })

  /**
   * Dois agregados sem valor por causas diferentes: a que nomeia a cidade vence, porque é a
   * acionável. Escolher a genérica esconderia o único dado que resolve o problema.
   */
  test('entre duas causas, a que nomeia a cidade é a que aparece', () => {
    expect(
      buildTripDriverCost([
        { driverId: 'a', paymentModel: 'route_table', routeAmount: null },
        {
          cityToRegister: 'ORLANDIA/SP',
          driverId: 'b',
          paymentModel: 'route_table',
          routeAmount: null,
          routeGap: 'CITY_WITHOUT_REGION',
        },
      ]),
    ).toMatchObject({ detail: 'ORLANDIA/SP', gap: 'CITY_WITHOUT_REGION' })
  })
})

describe('o custo do motorista (spec 061 T003)', () => {
  /** O caso do agregado: a tabela de região cruzada com a classe do veículo dá o valor da rota. */
  test('soma o que a tabela paga a cada agregado', () => {
    const parcel = buildTripDriverCost([
      AGGREGATE,
      { driverId: 'c', paymentModel: 'route_table', routeAmount: '273.5500' },
    ])

    expect(parcel).toEqual({
      amount: '1086.0000',
      /**
       * ⚠️ Spec 110 D7: a base sai do **primeiro pago por rota**, e é o suficiente — a zona é da
       * viagem, não do condutor: todos os agregados foram pagos pela mesma, porque ela é decidida
       * pelo destino mais distante do roteiro (spec 086 D1).
       */
      basis: {
        of: 'driver',
        paymentModel: 'route_table',
        regionCity: null,
        regionCode: null,
        vehicleClass: '',
      },
      detail: null,
      gap: null,
      kind: 'driver',
      source: 'measured',
    })
  })

  /**
   * ADR-0049 §3: o salário **não é rateado por viagem**. Ratear exigiria saber quantas viagens o
   * período terá, o que só se sabe no fim dele — e o resultado congela antes disso.
   */
  test('tripulação assalariada é custo do período, não da viagem', () => {
    expect(buildTripDriverCost([SALARIED])).toEqual({
      detail: null,
      amount: '0.0000',
      /**
       * ⚠️ Spec 110 D7: o zero vem com a base que o explica. Sem ela a tela imprime "R$ 0,00" para
       * um custo que existe — só que ele é do período, não da viagem (ADR-0049 §3).
       */
      basis: {
        of: 'driver',
        paymentModel: 'fixed',
        regionCity: null,
        regionCode: null,
        vehicleClass: '',
      },
      gap: null,
      kind: 'driver',
      source: 'period',
    })
  })

  /** Esconder o salário faria a viagem parecer mais barata do que é. */
  test('tripulação mista soma o agregado e diz que há salário fora da conta', () => {
    const parcel = buildTripDriverCost([AGGREGATE, SALARIED])

    expect(parcel.amount).toBe('812.4500')
    expect(parcel.source).toBe('measured')
    expect(parcel.gap).toBe('SALARIED_CREW_MEMBER')
  })

  /**
   * Agregado sem linha na tabela é **desconhecido**, e o total não é a soma dos que tiveram: a
   * viagem entra na lista de "resultado incompleto por cadastro" até alguém cadastrar a rota.
   */
  test('agregado sem valor na tabela deixa o custo desconhecido, não parcial', () => {
    const parcel = buildTripDriverCost([
      AGGREGATE,
      { driverId: 'd', paymentModel: 'route_table', routeAmount: null },
    ])

    expect(parcel).toEqual({
      amount: '0.0000',
      detail: null,
      gap: 'NO_DRIVER_RATE',
      kind: 'driver',
      source: 'missing',
    })
  })

  test('viagem sem condutor é desconhecida, nunca gratuita', () => {
    expect(buildTripDriverCost([])).toMatchObject({ gap: 'NO_DRIVER_RATE', source: 'missing' })
  })
})

describe('o imposto que desce da receita (spec 061 T004)', () => {
  const RATES = { cofinsRate: '0.030000', pisRate: '0.006500' }

  /** O ICMS é do documento: ele viajou no XML, e é de lá que sai. */
  test('soma o ICMS dos documentos emitidos', () => {
    const [icms] = buildTripTaxParcels({
      documents: [{ icmsAmount: '120.5000' }, { icmsAmount: '79.5000' }],
      federalRates: RATES,
      revenueAmount: '2000.0000',
    })

    expect(icms).toEqual({
      amount: '200.0000',
      detail: null,
      gap: null,
      kind: 'icms',
      source: 'measured',
    })
  })

  /**
   * CST isento, não tributado ou diferido tem ICMS zero **de fato** — e isso é medido. A diferença
   * entre "não paga" e "não sei" é a razão de a origem existir.
   */
  test('isento é zero medido, e nota sem documento é lacuna', () => {
    const [isento] = buildTripTaxParcels({
      documents: [{ icmsAmount: '0.0000' }],
      federalRates: RATES,
      revenueAmount: '1000.0000',
    })
    expect(isento).toMatchObject({ amount: '0.0000', gap: null, source: 'measured' })

    const [parcial] = buildTripTaxParcels({
      documents: [{ icmsAmount: '120.5000' }, { icmsAmount: null }],
      federalRates: RATES,
      revenueAmount: '1000.0000',
    })
    expect(parcial).toMatchObject({ amount: '120.5000', source: 'measured' })
    expect(parcial?.gap).not.toBeNull()

    const [nenhum] = buildTripTaxParcels({
      documents: [{ icmsAmount: null }],
      federalRates: RATES,
      revenueAmount: '0.0000',
    })
    expect(nenhum).toMatchObject({ amount: '0.0000', source: 'missing' })
  })

  /** 2.000,00 × (0,65% + 3%) = 73,00 — em `numeric`, sem passar por ponto flutuante. */
  test('aplica PIS e COFINS sobre a receita apurada', () => {
    const [, federal] = buildTripTaxParcels({
      documents: [{ icmsAmount: '0.0000' }],
      federalRates: RATES,
      revenueAmount: '2000.0000',
    })

    expect(federal).toEqual({
      amount: '73.0000',
      detail: null,
      gap: null,
      kind: 'pis_cofins',
      source: 'measured',
    })
  })

  /**
   * ADR-0049 §4: sem regime declarado, os federais ficam **`missing`** — assumir um erraria em
   * silêncio para metade das instalações, com cara de número certo.
   */
  test('empresa sem regime não zera o federal: ela o declara desconhecido', () => {
    const [, federal] = buildTripTaxParcels({
      documents: [{ icmsAmount: '10.0000' }],
      federalRates: null,
      revenueAmount: '2000.0000',
    })

    expect(federal).toEqual({
      amount: '0.0000',
      detail: null,
      gap: 'NO_FEDERAL_REGIME',
      kind: 'pis_cofins',
      source: 'missing',
    })
  })

  /** Arredondamento na quarta casa, meio para cima — a mesma regra do resto do dinheiro. */
  test('arredonda o federal na quarta casa', () => {
    const [, federal] = buildTripTaxParcels({
      documents: [{ icmsAmount: '0.0000' }],
      federalRates: { cofinsRate: '0.076000', pisRate: '0.016500' },
      revenueAmount: '1234.5600',
    })

    expect(federal?.amount).toBe('114.1968')
  })
})
