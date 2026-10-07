/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.1, CA1/CA2: a tabela de somas. Cada linha foi conferida à mão contra o calendário
 * civil antes de existir código; a numeração é a da tabela validada na spec (evidence.md § T1.1).
 * Sábado não é útil, salvo onde a linha diz `saturdayIsBusinessDay`.
 */
import { describe, expect, test } from 'bun:test'

import { addBusinessDays } from '../../src/business-calendar/domain/business-calendar.policy.js'
import { type TestCity, buildTestCalendar, yearOf } from '../fixtures/business-calendar.fixture.js'

type AddCase = {
  readonly city: TestCity
  readonly days: number
  readonly expected: string
  readonly line: number
  readonly saturdayIsBusinessDay?: boolean
  readonly start: string
}

const SATURDAY = true

const ADD_CASES: readonly AddCase[] = [
  { city: 'campinas', days: 3, expected: '2026-10-16', line: 1, start: '2026-10-09' },
  { city: 'saoPaulo', days: 3, expected: '2026-10-15', line: 2, start: '2026-10-09' },
  { city: 'campinas', days: 0, expected: '2026-10-14', line: 3, start: '2026-10-14' },
  { city: 'campinas', days: 0, expected: '2026-10-14', line: 4, start: '2026-10-10' },
  { city: 'campinas', days: 0, expected: '2026-10-14', line: 5, start: '2026-10-12' },
  { city: 'saoPaulo', days: 3, expected: '2026-10-16', line: 6, start: '2026-10-10' },
  { city: 'saoPaulo', days: 1, expected: '2026-10-14', line: 7, start: '2026-10-11' },
  { city: 'saoPaulo', days: 1, expected: '2026-02-18', line: 8, start: '2026-02-13' },
  { city: 'saoPaulo', days: 2, expected: '2027-02-11', line: 9, start: '2027-02-05' },
  { city: 'saoPaulo', days: 1, expected: '2028-03-01', line: 10, start: '2028-02-25' },
  { city: 'saoPaulo', days: 1, expected: '2026-04-06', line: 11, start: '2026-04-02' },
  { city: 'saoPaulo', days: 1, expected: '2027-03-29', line: 12, start: '2027-03-25' },
  { city: 'saoPaulo', days: 1, expected: '2025-04-22', line: 13, start: '2025-04-17' },
  { city: 'saoPaulo', days: 1, expected: '2026-06-05', line: 14, start: '2026-06-03' },
  { city: 'saoPaulo', days: 2, expected: '2027-05-31', line: 15, start: '2027-05-26' },
  { city: 'saoPaulo', days: 1, expected: '2025-06-20', line: 16, start: '2025-06-18' },
  { city: 'saoPaulo', days: 1, expected: '2000-04-24', line: 17, start: '2000-04-20' },
  { city: 'saoPaulo', days: 3, expected: '2026-12-30', line: 18, start: '2026-12-24' },
  { city: 'saoPaulo', days: 2, expected: '2028-01-03', line: 19, start: '2027-12-30' },
  { city: 'saoPaulo', days: 1, expected: '2026-10-01', line: 20, start: '2026-09-30' },
  { city: 'saoPaulo', days: 1, expected: '2027-03-01', line: 21, start: '2027-02-26' },
  { city: 'saoPaulo', days: 1, expected: '2026-11-03', line: 22, start: '2026-10-30' },
  { city: 'saoPaulo', days: 1, expected: '2026-11-16', line: 23, start: '2026-11-13' },
  {
    city: 'saoPaulo',
    days: 1,
    expected: '2026-11-14',
    line: 24,
    saturdayIsBusinessDay: SATURDAY,
    start: '2026-11-13',
  },
  { city: 'saoPaulo', days: 1, expected: '2026-11-23', line: 25, start: '2026-11-19' },
  {
    city: 'saoPaulo',
    days: 1,
    expected: '2027-05-03',
    line: 26,
    saturdayIsBusinessDay: SATURDAY,
    start: '2027-04-30',
  },
  { city: 'campinas', days: 1, expected: '2026-07-15', line: 27, start: '2026-07-13' },
  { city: 'campinas', days: 1, expected: '2027-07-15', line: 28, start: '2027-07-13' },
  { city: 'campinas', days: 1, expected: '2028-07-17', line: 29, start: '2028-07-13' },
  { city: 'campinas', days: 1, expected: '2025-07-15', line: 30, start: '2025-07-11' },
  { city: 'saoPaulo', days: 1, expected: '2027-01-26', line: 31, start: '2027-01-22' },
  { city: 'ribeiraoPreto', days: 1, expected: '2027-06-21', line: 32, start: '2027-06-18' },
  {
    city: 'ribeiraoPreto',
    days: 1,
    expected: '2027-06-21',
    line: 33,
    saturdayIsBusinessDay: SATURDAY,
    start: '2027-06-18',
  },
  { city: 'ribeiraoPreto', days: 1, expected: '2028-06-20', line: 34, start: '2028-06-16' },
  { city: 'saoPaulo', days: 1, expected: '2026-07-10', line: 35, start: '2026-07-08' },
  { city: 'rioDeJaneiro', days: 1, expected: '2026-07-09', line: 36, start: '2026-07-08' },
  { city: 'rioDeJaneiro', days: 1, expected: '2027-04-26', line: 37, start: '2027-04-22' },
  { city: 'saoPaulo', days: 1, expected: '2027-04-23', line: 38, start: '2027-04-22' },
  { city: 'campinas', days: 2, expected: '2026-07-13', line: 39, start: '2026-07-08' },
  { city: 'saoPaulo', days: 0, expected: '2026-10-13', line: 40, start: '2026-10-13' },
  { city: 'campinas', days: 1, expected: '2027-10-14', line: 41, start: '2027-10-12' },
  { city: 'beloHorizonte', days: 1, expected: '2024-03-01', line: 42, start: '2024-02-28' },
  { city: 'beloHorizonte', days: 1, expected: '2025-02-28', line: 43, start: '2025-02-27' },
  {
    city: 'saoPaulo',
    days: 1,
    expected: '2026-10-10',
    line: 45,
    saturdayIsBusinessDay: SATURDAY,
    start: '2026-10-09',
  },
  {
    city: 'saoPaulo',
    days: 3,
    expected: '2026-10-14',
    line: 46,
    saturdayIsBusinessDay: SATURDAY,
    start: '2026-10-09',
  },
  { city: 'saoPaulo', days: 60, expected: '2027-01-08', line: 48, start: '2026-10-09' },
  { city: 'campinas', days: 60, expected: '2027-01-11', line: 49, start: '2026-10-09' },
  { city: 'campinas', days: 20, expected: '2027-01-11', line: 50, start: '2026-12-10' },
]

/** O dia 0 é a data inicial quando ela é útil; senão, o primeiro dia útil depois dela. */
const DAY_ZERO_CASES: readonly Pick<AddCase, 'city' | 'expected' | 'line' | 'start'>[] = [
  { city: 'campinas', expected: '2026-10-09', line: 1, start: '2026-10-09' },
  { city: 'campinas', expected: '2026-10-14', line: 4, start: '2026-10-10' },
  { city: 'campinas', expected: '2026-10-14', line: 5, start: '2026-10-12' },
  { city: 'saoPaulo', expected: '2026-10-13', line: 6, start: '2026-10-10' },
  { city: 'saoPaulo', expected: '2026-10-13', line: 7, start: '2026-10-11' },
]

describe('spec 238 — somar dias úteis por cidade (CA1, CA2)', () => {
  for (const addCase of ADD_CASES) {
    test(`linha ${String(addCase.line)}: ${addCase.city} ${addCase.start} + ${String(addCase.days)}`, () => {
      const calendar = buildTestCalendar({
        city: addCase.city,
        fromYear: yearOf(addCase.start),
        saturdayIsBusinessDay: addCase.saturdayIsBusinessDay ?? false,
      })

      const result = addBusinessDays({ calendar, days: addCase.days, start: addCase.start })

      expect(result.date).toBe(addCase.expected)
    })
  }

  for (const dayZeroCase of DAY_ZERO_CASES) {
    test(`linha ${String(dayZeroCase.line)}: o dia 0 de ${dayZeroCase.start} é ${dayZeroCase.expected}`, () => {
      const calendar = buildTestCalendar({
        city: dayZeroCase.city,
        fromYear: yearOf(dayZeroCase.start),
      })

      const result = addBusinessDays({ calendar, days: 0, start: dayZeroCase.start })

      expect(result.dayZero).toBe(dayZeroCase.expected)
    })
  }
})
