/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { DEFAULT_DAILY_ALLOWANCE_AMOUNT } from '../../src/trips/domain/daily-allowance.constant.js'
import {
  DAILY_ALLOWANCE_RATE_ORIGIN,
  resolveDailyAllowance,
  suggestAllowanceDays,
} from '../../src/trips/domain/daily-allowance.policy.js'

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
