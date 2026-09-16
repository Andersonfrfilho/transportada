/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { MONEY_SCALE, parseScaledDecimal } from '../../src/shared/decimal.service.js'
import { DEFAULT_DAILY_ALLOWANCE_AMOUNT } from '../../src/trips/domain/daily-allowance.constant.js'
import {
  DAILY_ALLOWANCE_DAYS_ORIGIN,
  DAILY_ALLOWANCE_RATE_ORIGIN,
  resolveDailyAllowance,
  suggestAllowanceDays,
} from '../../src/trips/domain/daily-allowance.policy.js'
import { buildTripDriverCost } from '../../src/trips/domain/trip-driver-cost.policy.js'
import { VALUATION_GAPS } from '../../src/trips/domain/trip-valuation.policy.js'

/**
 * Spec 143 D3/D4 — **a diária paga o motorista**, e a política só decide duas coisas: quanto (de
 * quem) e quantos dias. Nada aqui lê banco; os quatro casos de dias e as três origens do valor são
 * os critérios de aceite 1–4 da spec.
 */
describe('resolveDailyAllowance picks the value, driver over company over default (D3)', () => {
  test('the driver amount wins even with a company amount set', () => {
    expect(resolveDailyAllowance({ companyAmount: '180.0000', driverAmount: '250.0000' })).toEqual({
      amount: '250.0000',
      rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.driver,
    })
  })

  test('the company amount is used when the driver has none', () => {
    expect(resolveDailyAllowance({ companyAmount: '180.0000', driverAmount: null })).toEqual({
      amount: '180.0000',
      rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.company,
    })
  })

  test('the default constant is used with neither set', () => {
    expect(resolveDailyAllowance({ companyAmount: null, driverAmount: null })).toEqual({
      amount: DEFAULT_DAILY_ALLOWANCE_AMOUNT,
      rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.default,
    })
  })
})

describe('suggestAllowanceDays rounds the trip duration up, minimum one day (D4)', () => {
  test('50 hours suggest 3 days', () => {
    expect(suggestAllowanceDays(50 * 3600)).toBe(3)
  })

  test('0 seconds still suggest the minimum of 1 day', () => {
    expect(suggestAllowanceDays(0)).toBe(1)
  })

  test('exactly 24 hours suggest 1 day', () => {
    expect(suggestAllowanceDays(24 * 3600)).toBe(1)
  })

  test('24 hours and 1 minute suggest 2 days', () => {
    expect(suggestAllowanceDays(24 * 3600 + 60)).toBe(2)
  })
})

/**
 * Spec 143 D1/D5 — **a parcela do motorista é `Σ (diária × dias)`**, e a tabela de região não entra
 * mais na conta. Os casos abaixo são os aceites 1, 3, 4 e 5 da spec, exercitados na política: o que
 * a T4 liga na consulta é de onde vêm `companyDailyAmount`, `driverAmount` e os dias.
 */
describe('buildTripDriverCost pays the crew per diem (D1, D5)', () => {
  test('aggregate with no own amount, 50-hour trip, company unconfigured (aceite 1)', () => {
    const parcel = buildTripDriverCost({
      companyDailyAmount: null,
      crew: [
        { driverAmount: null, driverId: DRIVER_ID, driverName: 'Ana', paymentModel: 'route_table' },
      ],
      days: suggestAllowanceDays(50 * 3600),
      daysOrigin: DAILY_ALLOWANCE_DAYS_ORIGIN.estimated,
    })

    expect(parcel).toEqual({
      amount: '600.0000',
      basis: {
        crew: [
          {
            dailyAmount: '200.0000',
            driverId: DRIVER_ID,
            driverName: 'Ana',
            paymentModel: 'route_table',
            rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.default,
            subtotal: '600.0000',
          },
        ],
        days: 3,
        daysOrigin: DAILY_ALLOWANCE_DAYS_ORIGIN.estimated,
        of: 'driver',
      },
      detail: null,
      gap: null,
      kind: 'driver',
      source: 'estimated',
    })
  })

  test('the driver amount beats the company one, and the company one beats nothing (aceite 3)', () => {
    const company = { companyDailyAmount: '180.0000', days: 1 } as const
    const withOwnAmount = buildTripDriverCost({
      ...company,
      crew: [
        {
          driverAmount: '250.0000',
          driverId: DRIVER_ID,
          driverName: null,
          paymentModel: 'route_table',
        },
      ],
      daysOrigin: DAILY_ALLOWANCE_DAYS_ORIGIN.informed,
    })
    const withoutOwnAmount = buildTripDriverCost({
      ...company,
      crew: [
        { driverAmount: null, driverId: DRIVER_ID, driverName: null, paymentModel: 'route_table' },
      ],
      daysOrigin: DAILY_ALLOWANCE_DAYS_ORIGIN.informed,
    })

    expect(withOwnAmount.amount).toBe('250.0000')
    expect(
      withOwnAmount.basis?.of === 'driver' ? withOwnAmount.basis.crew[0]?.rateOrigin : null,
    ).toBe(DAILY_ALLOWANCE_RATE_ORIGIN.driver)
    expect(withoutOwnAmount.amount).toBe('180.0000')
    expect(
      withoutOwnAmount.basis?.of === 'driver' ? withoutOwnAmount.basis.crew[0]?.rateOrigin : null,
    ).toBe(DAILY_ALLOWANCE_RATE_ORIGIN.company)
  })

  test('an aggregate and a salaried driver both get paid, one line each (aceite 4)', () => {
    const parcel = buildTripDriverCost({
      companyDailyAmount: null,
      crew: [
        {
          driverAmount: '250.0000',
          driverId: DRIVER_ID,
          driverName: 'Ana',
          paymentModel: 'route_table',
        },
        {
          driverAmount: null,
          driverId: OTHER_DRIVER_ID,
          driverName: 'Bruno',
          paymentModel: 'fixed',
        },
      ],
      days: 2,
      daysOrigin: DAILY_ALLOWANCE_DAYS_ORIGIN.informed,
    })

    expect(parcel.amount).toBe('900.0000')
    expect(parcel.source).toBe('measured')
    /** ADR-0049 §3 caiu: o da casa também recebe diária, então não há mais lacuna de assalariado. */
    expect(parcel.gap).toBeNull()
    expect(parcel.basis?.of === 'driver' ? parcel.basis.crew : []).toEqual([
      {
        dailyAmount: '250.0000',
        driverId: DRIVER_ID,
        driverName: 'Ana',
        paymentModel: 'route_table',
        rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.driver,
        subtotal: '500.0000',
      },
      {
        dailyAmount: '200.0000',
        driverId: OTHER_DRIVER_ID,
        driverName: 'Bruno',
        paymentModel: 'fixed',
        rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.default,
        subtotal: '400.0000',
      },
    ])
  })

  test('a route with no cell in the region table no longer opens a gap (aceite 5)', () => {
    const parcel = buildTripDriverCost({
      companyDailyAmount: null,
      crew: [
        { driverAmount: null, driverId: DRIVER_ID, driverName: null, paymentModel: 'route_table' },
      ],
      days: 1,
      daysOrigin: DAILY_ALLOWANCE_DAYS_ORIGIN.estimated,
    })

    expect(parcel.gap).toBeNull()
    expect(parcel.amount).toBe(DEFAULT_DAILY_ALLOWANCE_AMOUNT)
  })

  /**
   * ⚠️ Exata, sem tolerância: o total é somado em `bigint` escalado, e qualquer arredondamento pelo
   * caminho apareceria aqui como centavo perdido entre a linha e o total.
   */
  test('the parcel total is exactly the sum of the crew subtotals', () => {
    const parcel = buildTripDriverCost({
      companyDailyAmount: '133.3300',
      crew: [
        { driverAmount: '77.7700', driverId: DRIVER_ID, driverName: null, paymentModel: 'fixed' },
        { driverAmount: null, driverId: OTHER_DRIVER_ID, driverName: null, paymentModel: 'fixed' },
        {
          driverAmount: '0.0100',
          driverId: THIRD_DRIVER_ID,
          driverName: null,
          paymentModel: 'fixed',
        },
      ],
      days: 7,
      daysOrigin: DAILY_ALLOWANCE_DAYS_ORIGIN.informed,
    })
    const crew = parcel.basis?.of === 'driver' ? parcel.basis.crew : []
    const subtotalSum = crew.reduce(
      (accumulated, line) =>
        accumulated +
        parseScaledDecimal({ errorCodePrefix: 'TEST', scale: MONEY_SCALE, value: line.subtotal }),
      0n,
    )

    expect(subtotalSum).toBe(
      parseScaledDecimal({ errorCodePrefix: 'TEST', scale: MONEY_SCALE, value: parcel.amount }),
    )
    expect(parcel.amount).toBe('1477.7700')
  })

  test('a trip with no crew is unknown, never free', () => {
    expect(
      buildTripDriverCost({
        companyDailyAmount: '180.0000',
        crew: [],
        days: 3,
        daysOrigin: DAILY_ALLOWANCE_DAYS_ORIGIN.informed,
      }),
    ).toEqual({
      amount: '0.0000',
      basis: null,
      detail: null,
      gap: VALUATION_GAPS.noTripDriver,
      kind: 'driver',
      source: 'missing',
    })
  })

  /** D4 garante o mínimo de um dia: zero ou negativo aqui é estado impossível, não fallback. */
  test('fewer than one day is an impossible state and throws', () => {
    expect(() =>
      buildTripDriverCost({
        companyDailyAmount: null,
        crew: [
          {
            driverAmount: null,
            driverId: DRIVER_ID,
            driverName: null,
            paymentModel: 'route_table',
          },
        ],
        days: 0,
        daysOrigin: DAILY_ALLOWANCE_DAYS_ORIGIN.informed,
      }),
    ).toThrow('TRIP_DRIVER_COST_INVALID_DAYS')
  })
})

const DRIVER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_DRIVER_ID = '22222222-2222-4222-8222-222222222222'
const THIRD_DRIVER_ID = '33333333-3333-4333-8333-333333333333'
