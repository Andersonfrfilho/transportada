/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildTripHelperCost,
  resolveHelperDayCount,
} from '../../src/trips/domain/trip-helper-cost.policy.js'

const HOUR = 3600

/** Spec 149 D7: `Σ(diária própria ?? geral) × dias`, com dias = max(1, ceil(jornada / 24h)). */
describe('a diária do ajudante (spec 149 T6, critérios 4 e 5)', () => {
  test('0 ajudantes: parcela zero, sem lacuna', () => {
    expect(
      buildTripHelperCost({
        companyDailyRate: '120.0000',
        helpers: [],
        journeyIncludesReturn: true,
        journeySeconds: 30 * HOUR,
      }),
    ).toEqual({ amount: '0.0000', detail: null, gap: null, kind: 'helper', source: 'measured' })
  })

  test('critério 4: diária própria 150 + geral 120, jornada 30h com volta = 540.00', () => {
    const parcel = buildTripHelperCost({
      companyDailyRate: '120.0000',
      helpers: [
        { driverId: 'a', ownDailyRate: '150.0000' },
        { driverId: 'b', ownDailyRate: null },
      ],
      journeyIncludesReturn: true,
      journeySeconds: 30 * HOUR,
    })

    expect(parcel).toEqual({
      amount: '540.0000',
      detail: null,
      gap: null,
      kind: 'helper',
      source: 'measured',
    })
  })

  test('critério 5: sem diária própria e sem geral vira missing com HELPER_DAILY_RATE_MISSING', () => {
    expect(
      buildTripHelperCost({
        companyDailyRate: null,
        helpers: [{ driverId: 'a', ownDailyRate: null }],
        journeyIncludesReturn: true,
        journeySeconds: 10 * HOUR,
      }),
    ).toEqual({
      amount: '0.0000',
      detail: null,
      gap: 'HELPER_DAILY_RATE_MISSING',
      kind: 'helper',
      source: 'missing',
    })
  })

  test('parte com diária e parte sem: soma quem tem e conta em "ausentes/total"', () => {
    const parcel = buildTripHelperCost({
      companyDailyRate: null,
      helpers: [
        { driverId: 'a', ownDailyRate: '150.0000' },
        { driverId: 'b', ownDailyRate: null },
      ],
      journeyIncludesReturn: true,
      journeySeconds: 1 * HOUR,
    })

    expect(parcel).toEqual({
      amount: '150.0000',
      detail: '1/2',
      gap: 'HELPER_DAILY_RATE_MISSING',
      kind: 'helper',
      source: 'measured',
    })
  })

  test('jornada nunca congelada, com ajudante: missing com HELPER_JOURNEY_UNKNOWN, nunca zero', () => {
    expect(
      buildTripHelperCost({
        companyDailyRate: '120.0000',
        helpers: [{ driverId: 'a', ownDailyRate: null }],
        journeyIncludesReturn: null,
        journeySeconds: null,
      }),
    ).toEqual({
      amount: '0.0000',
      detail: null,
      gap: 'HELPER_JOURNEY_UNKNOWN',
      kind: 'helper',
      source: 'missing',
    })
  })

  test('jornada congelada só de ida: estimated com aviso HELPER_JOURNEY_WITHOUT_RETURN', () => {
    const parcel = buildTripHelperCost({
      companyDailyRate: '120.0000',
      helpers: [{ driverId: 'a', ownDailyRate: null }],
      journeyIncludesReturn: false,
      journeySeconds: 10 * HOUR,
    })

    expect(parcel).toEqual({
      amount: '120.0000',
      detail: null,
      gap: 'HELPER_JOURNEY_WITHOUT_RETURN',
      kind: 'helper',
      source: 'estimated',
    })
  })

  describe('dias = max(1, ceil(jornada / 24h))', () => {
    test('9h vira 1 dia', () => expect(resolveHelperDayCount(9 * HOUR)).toBe(1))
    test('24h vira 1 dia', () => expect(resolveHelperDayCount(24 * HOUR)).toBe(1))
    test('24h01 vira 2 dias', () => expect(resolveHelperDayCount(24 * HOUR + 60)).toBe(2))
  })
})
