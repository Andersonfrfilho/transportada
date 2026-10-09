/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveBudgetMonth,
  resolveFailureNextAttemptAt,
  resolveHorizonYears,
  resolveNextMonthStart,
  resolveSaoPauloCivilDate,
} from '../../src/holiday-provider-pull/domain/holiday-provider-schedule.policy.js'

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

describe('o dia civil e o mês do relógio injetado (spec 252 T3.3, D7/D8)', () => {
  test('o dia é o de São Paulo, não o de UTC', () => {
    expect(resolveSaoPauloCivilDate(new Date('2026-10-09T12:00:00.000Z'))).toBe('2026-10-09')
    expect(resolveSaoPauloCivilDate(new Date('2026-10-10T02:59:59.000Z'))).toBe('2026-10-09')
    expect(resolveSaoPauloCivilDate(new Date('2026-10-10T03:00:00.000Z'))).toBe('2026-10-10')
    expect(resolveSaoPauloCivilDate(new Date('2027-01-01T02:00:00.000Z'))).toBe('2026-12-31')
  })

  test('o horizonte é o ano corrente e o seguinte, pelo dia de São Paulo', () => {
    expect(resolveHorizonYears(new Date('2026-10-09T12:00:00.000Z'))).toEqual([2026, 2027])
    expect(resolveHorizonYears(new Date('2027-01-01T02:00:00.000Z'))).toEqual([2026, 2027])
    expect(resolveHorizonYears(new Date('2027-01-01T03:00:00.000Z'))).toEqual([2027, 2028])
  })

  test('o orçamento é do mês de São Paulo, sempre no dia 1º', () => {
    expect(resolveBudgetMonth(new Date('2026-10-09T12:00:00.000Z'))).toBe('2026-10-01')
    expect(resolveBudgetMonth(new Date('2026-11-01T02:59:00.000Z'))).toBe('2026-10-01')
    expect(resolveBudgetMonth(new Date('2026-11-01T03:00:00.000Z'))).toBe('2026-11-01')
  })

  test('a cota esgotada vale até a meia-noite do dia 1º de São Paulo', () => {
    expect(resolveNextMonthStart(new Date('2026-10-09T12:00:00.000Z')).toISOString()).toBe(
      '2026-11-01T03:00:00.000Z',
    )
    expect(resolveNextMonthStart(new Date('2026-12-31T20:00:00.000Z')).toISOString()).toBe(
      '2027-01-01T03:00:00.000Z',
    )
  })
})

describe('o recuo da falha do fornecedor (spec 252 T3.3, ADR-0100 §5)', () => {
  const now = new Date('2026-10-09T12:00:00.000Z')

  test('1 h, 6 h, 24 h e, dali em diante, 7 dias', () => {
    const waits = [1, 2, 3, 4, 5, 20].map(
      (failedAttempts) =>
        resolveFailureNextAttemptAt({ failedAttempts, now }).getTime() - now.getTime(),
    )

    expect(waits).toEqual([HOUR_MS, 6 * HOUR_MS, 24 * HOUR_MS, 7 * DAY_MS, 7 * DAY_MS, 7 * DAY_MS])
  })
})
