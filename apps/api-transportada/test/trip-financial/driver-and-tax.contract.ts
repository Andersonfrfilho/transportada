/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  DAILY_ALLOWANCE_DAYS_ORIGIN,
  DAILY_ALLOWANCE_RATE_ORIGIN,
} from '../../src/trips/domain/daily-allowance.policy.js'
import { buildTripDriverCost } from '../../src/trips/domain/trip-driver-cost.policy.js'
import { VALUATION_GAPS } from '../../src/trips/domain/trip-valuation.policy.js'
import { buildTripTaxParcels } from '../../src/trips/domain/trip-tax.policy.js'

const AGGREGATE = {
  driverAmount: '812.4500',
  driverId: 'a',
  driverName: null,
  paymentModel: 'route_table' as const,
}
const SALARIED = {
  driverAmount: null,
  driverId: 'b',
  driverName: null,
  paymentModel: 'fixed' as const,
}
const ONE_INFORMED_DAY = { days: { of: DAILY_ALLOWANCE_DAYS_ORIGIN.informed, value: 1 } } as const

/**
 * Spec 143 D1: **a causa da lacuna sumiu junto com a tabela de região.** A 086 separou "o motorista
 * não cobre esta zona" de "ITOBI/SP não está na tabela" porque cada uma se resolvia numa tela
 * diferente; com a diária não há célula para faltar, e nenhuma das duas volta a aparecer.
 */
describe('a lacuna do agregado acabou com a tabela de região (spec 143)', () => {
  test('cidade fora da tabela não deixa mais o custo desconhecido', () => {
    expect(
      buildTripDriverCost({
        companyDailyAmount: '200.0000',
        crew: [
          { driverAmount: null, driverId: 'a', driverName: null, paymentModel: 'route_table' },
        ],
        ...ONE_INFORMED_DAY,
      }),
    ).toMatchObject({ amount: '200.0000', detail: null, gap: null, source: 'measured' })
  })

  /** A única lacuna que sobra é não haver condutor — e ela nada tem a ver com cadastro de rota. */
  test('a única lacuna que sobra é a viagem sem condutor', () => {
    expect(
      buildTripDriverCost({
        companyDailyAmount: '200.0000',
        crew: [],
        ...ONE_INFORMED_DAY,
      }),
    ).toMatchObject({ detail: null, gap: VALUATION_GAPS.noTripDriver })
  })
})

describe('o custo do motorista (spec 061 T003, reescrito pela 143)', () => {
  /** A diária de cada condutor vezes os dias, somadas — a classe do veículo saiu da conta. */
  test('soma a diária de cada condutor', () => {
    const parcel = buildTripDriverCost({
      companyDailyAmount: null,
      crew: [
        AGGREGATE,
        { driverAmount: '273.5500', driverId: 'c', driverName: null, paymentModel: 'route_table' },
      ],
      ...ONE_INFORMED_DAY,
    })

    expect(parcel).toEqual({
      amount: '1086.0000',
      basis: {
        crew: [
          {
            dailyAmount: '812.4500',
            driverId: 'a',
            driverName: null,
            paymentModel: 'route_table',
            rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.driver,
            subtotal: '812.4500',
          },
          {
            dailyAmount: '273.5500',
            driverId: 'c',
            driverName: null,
            paymentModel: 'route_table',
            rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.driver,
            subtotal: '273.5500',
          },
        ],
        days: 1,
        daysOrigin: DAILY_ALLOWANCE_DAYS_ORIGIN.informed,
        of: 'driver',
      },
      detail: null,
      gap: null,
      kind: 'driver',
      source: 'measured',
    })
  })

  /**
   * ⚠️ ADR-0049 §3 caiu na 143: a diária não é salário rateado, é despesa da viagem — o assalariado
   * recebe diária pelos mesmos dias que o agregado, e a viagem deixa de imprimir "R$ 0,00" para um
   * custo que existe.
   */
  test('tripulação assalariada também recebe diária, e não é mais custo do período', () => {
    const parcel = buildTripDriverCost({
      companyDailyAmount: '180.0000',
      crew: [SALARIED],
      ...ONE_INFORMED_DAY,
    })

    expect(parcel.amount).toBe('180.0000')
    expect(parcel.source).toBe('measured')
    expect(parcel.gap).toBeNull()
  })

  /** Nada fica fora da conta: as duas linhas entram no mesmo total. */
  test('tripulação mista soma o agregado e o assalariado na mesma conta', () => {
    const parcel = buildTripDriverCost({
      companyDailyAmount: '180.0000',
      crew: [AGGREGATE, SALARIED],
      ...ONE_INFORMED_DAY,
    })

    expect(parcel.amount).toBe('992.4500')
    expect(parcel.source).toBe('measured')
    expect(parcel.gap).toBeNull()
  })

  /** Sem valor próprio e sem valor da empresa, o padrão do sistema paga — nunca fica desconhecido. */
  test('condutor sem valor próprio cai no valor da empresa, e o custo continua conhecido', () => {
    const parcel = buildTripDriverCost({
      companyDailyAmount: '180.0000',
      crew: [
        AGGREGATE,
        { driverAmount: null, driverId: 'd', driverName: null, paymentModel: 'route_table' },
      ],
      ...ONE_INFORMED_DAY,
    })

    expect(parcel.amount).toBe('992.4500')
    expect(parcel.gap).toBeNull()
    expect(parcel.source).toBe('measured')
  })

  test('viagem sem condutor é desconhecida, nunca gratuita', () => {
    expect(
      buildTripDriverCost({ companyDailyAmount: null, crew: [], ...ONE_INFORMED_DAY }),
    ).toMatchObject({ gap: VALUATION_GAPS.noTripDriver, source: 'missing' })
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
