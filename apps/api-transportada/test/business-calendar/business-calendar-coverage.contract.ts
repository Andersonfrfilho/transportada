/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.1: a cobertura limita a conta. Ano fora dela é recusado — nunca vira "sem feriado" —
 * e o volume de regras tem teto.
 */
import { describe, expect, test } from 'bun:test'

import { BUSINESS_CALENDAR_ERROR_CODE } from '../../src/business-calendar/domain/business-calendar.constant.js'
import {
  addBusinessDays,
  countBusinessDays,
  explainDay,
  isBusinessDay,
} from '../../src/business-calendar/domain/business-calendar.policy.js'
import { listNationalHolidays } from '../../src/business-calendar/domain/national-holiday.policy.js'
import { TEST_CITY_IBGE_CODE, buildTestCalendar } from '../fixtures/business-calendar.fixture.js'
import { buildWith, expectCalendarError } from './business-calendar-error.helper.js'

const CODE = BUSINESS_CALENDAR_ERROR_CODE

describe('spec 238 — cobertura e limites', () => {
  test('recusa cobertura acima de cinco anos', () => {
    expectCalendarError({
      action: buildWith({ coverage: { fromYear: 2026, toYear: 2032 } }),
      code: CODE.COVERAGE_TOO_WIDE,
    })
    expect(buildWith({ coverage: { fromYear: 2026, toYear: 2031 } })).not.toThrow()
  })

  test('recusa cobertura invertida, fracionária ou fora do calendário gregoriano', () => {
    for (const coverage of [
      { fromYear: 2027, toYear: 2026 },
      { fromYear: 2026.5, toYear: 2027 },
      { fromYear: 1500, toYear: 1501 },
    ]) {
      expectCalendarError({ action: buildWith({ coverage }), code: CODE.INVALID_COVERAGE })
    }
    expectCalendarError({ action: () => listNationalHolidays(2026.5), code: CODE.INVALID_COVERAGE })
  })

  test('data ou conta fora da cobertura é recusada, nunca vira "sem feriado"', () => {
    const calendar = buildTestCalendar({ city: 'campinas', fromYear: 2026 })

    expectCalendarError({
      action: () => isBusinessDay({ calendar, date: '2028-01-03' }),
      code: CODE.OUT_OF_COVERAGE,
    })
    expectCalendarError({
      action: () => explainDay({ calendar, date: '2025-12-31' }),
      code: CODE.OUT_OF_COVERAGE,
    })
    expectCalendarError({
      action: () => addBusinessDays({ calendar, days: 1, start: '2025-12-31' }),
      code: CODE.OUT_OF_COVERAGE,
    })
    expectCalendarError({
      action: () => addBusinessDays({ calendar, days: 5, start: '2027-12-27' }),
      code: CODE.OUT_OF_COVERAGE,
    })
    expectCalendarError({
      action: () => addBusinessDays({ calendar, days: 1, start: '2027-12-31' }),
      code: CODE.OUT_OF_COVERAGE,
    })
    expectCalendarError({
      action: () => countBusinessDays({ calendar, from: '2027-12-30', to: '2028-01-03' }),
      code: CODE.OUT_OF_COVERAGE,
    })
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

    expectCalendarError({
      action: buildWith({ municipalRules, stateRules }),
      code: CODE.TOO_MANY_RULES,
    })
    expect(buildWith({ municipalRules: municipalRules.slice(1), stateRules })).not.toThrow()
  })
})
