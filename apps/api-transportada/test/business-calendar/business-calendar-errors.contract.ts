/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.1: o calendário recusa com erro tipado e nunca "assume". Ano fora da cobertura não
 * vira "sem feriado", dado corrompido não é ignorado e nenhuma conta trava.
 */
import { describe, expect, test } from 'bun:test'

import { BUSINESS_CALENDAR_ERROR_CODE } from '../../src/business-calendar/domain/business-calendar.constant.js'
import {
  addBusinessDays,
  buildBusinessCalendar,
  countBusinessDays,
  explainDay,
  isBusinessDay,
} from '../../src/business-calendar/domain/business-calendar.policy.js'
import type { BuildBusinessCalendarParams } from '../../src/business-calendar/domain/business-calendar.types.js'
import { parseCivilDate } from '../../src/business-calendar/domain/civil-date.policy.js'
import { listNationalHolidays } from '../../src/business-calendar/domain/national-holiday.policy.js'
import {
  TEST_CITY_IBGE_CODE,
  TEST_MUNICIPAL_RULES,
  TEST_STATE_RULES,
  buildTestCalendar,
} from '../fixtures/business-calendar.fixture.js'
import { expectCalendarError } from './business-calendar-error.helper.js'

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

const VALID_PARAMS: BuildBusinessCalendarParams = {
  cityIbgeCode: TEST_CITY_IBGE_CODE.campinas,
  coverage: { fromYear: 2026, toYear: 2027 },
  municipalRules: TEST_MUNICIPAL_RULES,
  saturdayIsBusinessDay: false,
  stateRules: TEST_STATE_RULES,
}

function buildWith(overrides: Partial<BuildBusinessCalendarParams>): () => unknown {
  return () => buildBusinessCalendar({ ...VALID_PARAMS, ...overrides })
}

describe('spec 238 — data civil inválida', () => {
  const calendar = buildTestCalendar({ city: 'campinas', fromYear: 2026 })

  for (const date of INVALID_DATES) {
    test(`recusa ${JSON.stringify(date)} em toda entrada`, () => {
      expectCalendarError(() => parseCivilDate(date), CODE.INVALID_DATE)
      expectCalendarError(() => isBusinessDay({ calendar, date }), CODE.INVALID_DATE)
      expectCalendarError(() => explainDay({ calendar, date }), CODE.INVALID_DATE)
      expectCalendarError(
        () => addBusinessDays({ calendar, days: 1, start: date }),
        CODE.INVALID_DATE,
      )
      expectCalendarError(
        () => countBusinessDays({ calendar, from: date, to: '2026-10-16' }),
        CODE.INVALID_DATE,
      )
      expectCalendarError(
        () => countBusinessDays({ calendar, from: '2026-10-16', to: date }),
        CODE.INVALID_DATE,
      )
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
      expectCalendarError(
        () => addBusinessDays({ calendar, days, start: '2026-01-02' }),
        CODE.INVALID_DAYS,
      )
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
      expectCalendarError(buildWith({ cityIbgeCode }), CODE.INVALID_CITY)
    })
  }

  for (const cityIbgeCode of ['1000000', '3909502', '5409502']) {
    test(`recusa a cidade de UF inexistente ${cityIbgeCode}`, () => {
      expectCalendarError(buildWith({ cityIbgeCode }), CODE.UNKNOWN_STATE)
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
      expectCalendarError(buildWith({ stateRules }), CODE.UNKNOWN_STATE)
    }
  })

  test('regra municipal de cidade inválida ou de UF inexistente não é ignorada', () => {
    const occurrence = { day: 1, month: 3, recurrence: 'yearly' } as const
    const rule = (cityIbgeCode: string) =>
      [{ cityIbgeCode, kind: 'holiday', name: 'Corrompido', occurrence }] as const

    expectCalendarError(buildWith({ municipalRules: rule('35095') }), CODE.INVALID_CITY)
    expectCalendarError(buildWith({ municipalRules: rule('3909502') }), CODE.UNKNOWN_STATE)
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
      expectCalendarError(buildWith({ municipalRules }), CODE.INVALID_RULE)
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
    expectCalendarError(buildWith({ stateRules }), CODE.INVALID_RULE)
  })

  test('29/02 anual é regra válida', () => {
    expect(buildWith({})).not.toThrow()
  })
})

describe('spec 238 — cobertura e limites', () => {
  test('recusa cobertura acima de cinco anos', () => {
    expectCalendarError(
      buildWith({ coverage: { fromYear: 2026, toYear: 2032 } }),
      CODE.COVERAGE_TOO_WIDE,
    )
    expect(buildWith({ coverage: { fromYear: 2026, toYear: 2031 } })).not.toThrow()
  })

  test('recusa cobertura invertida, fracionária ou fora do calendário gregoriano', () => {
    for (const coverage of [
      { fromYear: 2027, toYear: 2026 },
      { fromYear: 2026.5, toYear: 2027 },
      { fromYear: 1500, toYear: 1501 },
    ]) {
      expectCalendarError(buildWith({ coverage }), CODE.INVALID_COVERAGE)
    }
    expectCalendarError(() => listNationalHolidays(2026.5), CODE.INVALID_COVERAGE)
  })

  test('data ou conta fora da cobertura é recusada, nunca vira "sem feriado"', () => {
    const calendar = buildTestCalendar({ city: 'campinas', fromYear: 2026 })

    expectCalendarError(() => isBusinessDay({ calendar, date: '2028-01-03' }), CODE.OUT_OF_COVERAGE)
    expectCalendarError(() => explainDay({ calendar, date: '2025-12-31' }), CODE.OUT_OF_COVERAGE)
    expectCalendarError(
      () => addBusinessDays({ calendar, days: 1, start: '2025-12-31' }),
      CODE.OUT_OF_COVERAGE,
    )
    expectCalendarError(
      () => addBusinessDays({ calendar, days: 5, start: '2027-12-27' }),
      CODE.OUT_OF_COVERAGE,
    )
    expectCalendarError(
      () => addBusinessDays({ calendar, days: 1, start: '2027-12-31' }),
      CODE.OUT_OF_COVERAGE,
    )
    expectCalendarError(
      () => countBusinessDays({ calendar, from: '2027-12-30', to: '2028-01-03' }),
      CODE.OUT_OF_COVERAGE,
    )
  })

  test('recusa mais de 5000 regras somadas', () => {
    const occurrence = { day: 1, month: 3, recurrence: 'yearly' } as const
    const municipalRules = Array.from({ length: 2501 }, () => ({
      cityIbgeCode: TEST_CITY_IBGE_CODE.campinas,
      kind: 'holiday' as const,
      name: 'Repetido',
      occurrence,
    }))
    const stateRules = Array.from({ length: 2500 }, () => ({
      name: 'Repetido',
      occurrence,
      stateIbgeCode: '35',
    }))

    expectCalendarError(buildWith({ municipalRules, stateRules }), CODE.TOO_MANY_RULES)
    expect(buildWith({ municipalRules: municipalRules.slice(1), stateRules })).not.toThrow()
  })
})
