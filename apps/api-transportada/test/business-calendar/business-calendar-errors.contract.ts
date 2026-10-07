/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.1: o calendário recusa com erro tipado e nunca "assume". Ano fora da cobertura não
 * vira "sem feriado" e dado corrompido não é ignorado. Cobertura e limites:
 * `business-calendar-coverage.contract.ts`.
 */
import { describe, expect, test } from 'bun:test'

import { BUSINESS_CALENDAR_ERROR_CODE } from '../../src/business-calendar/domain/business-calendar.constant.js'
import {
  addBusinessDays,
  countBusinessDays,
  explainDay,
  isBusinessDay,
} from '../../src/business-calendar/domain/business-calendar.policy.js'
import { parseCivilDate } from '../../src/business-calendar/domain/civil-date.policy.js'
import { TEST_CITY_IBGE_CODE, buildTestCalendar } from '../fixtures/business-calendar.fixture.js'
import { buildWith, expectCalendarError } from './business-calendar-error.helper.js'

const CODE = BUSINESS_CALENDAR_ERROR_CODE

const INVALID_DATES = [
  '',
  '2026-2-3',
  '2026-02-30',
  '2027-02-29',
  '2026-13-01',
  ' 2026-10-09',
  '2026-10-09T00:00:00Z',
] as const

describe('spec 238 — data civil inválida', () => {
  const calendar = buildTestCalendar({ city: 'campinas', fromYear: 2026 })

  for (const date of INVALID_DATES) {
    test(`recusa ${JSON.stringify(date)} em toda entrada`, () => {
      expectCalendarError({ action: () => parseCivilDate(date), code: CODE.INVALID_DATE })
      expectCalendarError({
        action: () => isBusinessDay({ calendar, date }),
        code: CODE.INVALID_DATE,
      })
      expectCalendarError({ action: () => explainDay({ calendar, date }), code: CODE.INVALID_DATE })
      expectCalendarError({
        action: () => addBusinessDays({ calendar, days: 1, start: date }),
        code: CODE.INVALID_DATE,
      })
      expectCalendarError({
        action: () => countBusinessDays({ calendar, from: date, to: '2026-10-16' }),
        code: CODE.INVALID_DATE,
      })
      expectCalendarError({
        action: () => countBusinessDays({ calendar, from: '2026-10-16', to: date }),
        code: CODE.INVALID_DATE,
      })
    })
  }

  test('29/02 de ano bissexto é data válida', () => {
    expect(parseCivilDate('2028-02-29')).toBe('2028-02-29')
  })
})

describe('spec 238 — quantidade de dias inválida', () => {
  const calendar = buildTestCalendar({ city: 'campinas', fromYear: 2026 })

  for (const days of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 367]) {
    test(`recusa ${String(days)} dias`, () => {
      expectCalendarError({
        action: () => addBusinessDays({ calendar, days, start: '2026-01-02' }),
        code: CODE.INVALID_DAYS,
      })
    })
  }

  test('aceita o teto de 366 dias quando a cobertura alcança', () => {
    expect(addBusinessDays({ calendar, days: 366, start: '2026-01-02' }).date).toStartWith('2027-')
  })
})

describe('spec 238 — cidade e UF', () => {
  for (const cityIbgeCode of [
    '',
    '350950',
    '35095021',
    '6509502',
    '0509502',
    'abcdefg',
    '3509502 ',
  ]) {
    test(`recusa a cidade ${JSON.stringify(cityIbgeCode)}`, () => {
      expectCalendarError({ action: buildWith({ cityIbgeCode }), code: CODE.INVALID_CITY })
    })
  }

  for (const cityIbgeCode of ['1000000', '3909502', '5409502']) {
    test(`recusa a cidade de UF inexistente ${cityIbgeCode}`, () => {
      expectCalendarError({ action: buildWith({ cityIbgeCode }), code: CODE.UNKNOWN_STATE })
    })
  }

  test('regra estadual de UF inexistente não é ignorada', () => {
    for (const stateIbgeCode of ['99', '3', '350', '']) {
      const stateRules = [
        {
          name: 'Corrompido',
          occurrence: { day: 1, month: 3, recurrence: 'yearly' },
          stateIbgeCode,
        },
      ] as const
      expectCalendarError({ action: buildWith({ stateRules }), code: CODE.UNKNOWN_STATE })
    }
  })

  test('regra municipal de cidade inválida ou de UF inexistente não é ignorada', () => {
    const occurrence = { day: 1, month: 3, recurrence: 'yearly' } as const
    const rule = (cityIbgeCode: string) =>
      [{ cityIbgeCode, kind: 'holiday', name: 'Corrompido', occurrence }] as const

    expectCalendarError({
      action: buildWith({ municipalRules: rule('35095') }),
      code: CODE.INVALID_CITY,
    })
    expectCalendarError({
      action: buildWith({ municipalRules: rule('3909502') }),
      code: CODE.UNKNOWN_STATE,
    })
  })
})

describe('spec 238 — regra inválida', () => {
  for (const [month, day] of [
    [2, 30],
    [4, 31],
    [13, 1],
    [0, 10],
    [2, 0],
    [1.5, 10],
  ] as const) {
    test(`recusa a regra anual ${String(month)}/${String(day)}`, () => {
      const municipalRules = [
        {
          cityIbgeCode: TEST_CITY_IBGE_CODE.campinas,
          kind: 'holiday',
          name: 'Inválido',
          occurrence: { day, month, recurrence: 'yearly' },
        },
      ] as const
      expectCalendarError({ action: buildWith({ municipalRules }), code: CODE.INVALID_RULE })
    })
  }

  test('recusa a regra única de data inexistente', () => {
    const stateRules = [
      {
        name: 'Inválido',
        occurrence: { date: '2026-02-30', recurrence: 'once' },
        stateIbgeCode: '35',
      },
    ] as const
    expectCalendarError({ action: buildWith({ stateRules }), code: CODE.INVALID_RULE })
  })

  test('29/02 anual é regra válida', () => {
    expect(buildWith({})).not.toThrow()
  })
})
