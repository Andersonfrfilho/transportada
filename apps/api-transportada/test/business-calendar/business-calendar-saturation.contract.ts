/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.1: um calendário em que todo dia é feriado não trava. A caminhada é limitada pelo fim
 * da cobertura e termina em `OUT_OF_COVERAGE` — nunca num laço, nunca numa data inventada.
 */
import { describe, expect, test } from 'bun:test'

import { BUSINESS_CALENDAR_ERROR_CODE } from '../../src/business-calendar/domain/business-calendar.constant.js'
import {
  addBusinessDays,
  buildBusinessCalendar,
  countBusinessDays,
  isBusinessDay,
} from '../../src/business-calendar/domain/business-calendar.policy.js'
import type { MunicipalHolidayRule } from '../../src/business-calendar/domain/business-calendar.types.js'
import { TEST_CITY_IBGE_CODE } from '../fixtures/business-calendar.fixture.js'
import { expectCalendarError } from './business-calendar-error.helper.js'

const DAYS_IN_LEAP_YEAR_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

function buildEveryDayRules(): readonly MunicipalHolidayRule[] {
  return DAYS_IN_LEAP_YEAR_MONTH.flatMap((daysInMonth, monthIndex) =>
    Array.from({ length: daysInMonth }, (_, dayIndex) => ({
      cityIbgeCode: TEST_CITY_IBGE_CODE.campinas,
      kind: 'holiday' as const,
      name: 'Todo dia',
      occurrence: { day: dayIndex + 1, month: monthIndex + 1, recurrence: 'yearly' as const },
    })),
  )
}

describe('spec 238 — calendário em que todo dia é feriado', () => {
  const municipalRules = buildEveryDayRules()
  const calendar = buildBusinessCalendar({
    cityIbgeCode: TEST_CITY_IBGE_CODE.campinas,
    coverage: { fromYear: 2026, toYear: 2031 },
    municipalRules,
    saturdayIsBusinessDay: true,
    stateRules: [],
  })

  test('são 366 regras anuais', () => {
    expect(municipalRules).toHaveLength(366)
  })

  test('nenhum dia é útil', () => {
    expect(isBusinessDay({ calendar, date: '2028-02-29' })).toBe(false)
    expect(isBusinessDay({ calendar, date: '2026-10-10' })).toBe(false)
    expect(countBusinessDays({ calendar, from: '2026-01-01', to: '2031-12-31' }).businessDays).toBe(
      0,
    )
  })

  test('procurar o dia 0 termina no fim da cobertura, com erro', () => {
    expectCalendarError({
      action: () => addBusinessDays({ calendar, days: 0, start: '2026-01-01' }),
      code: BUSINESS_CALENDAR_ERROR_CODE.OUT_OF_COVERAGE,
    })
  })

  test('somar o teto de dias termina no fim da cobertura, com erro', () => {
    expectCalendarError({
      action: () => addBusinessDays({ calendar, days: 366, start: '2026-03-10' }),
      code: BUSINESS_CALENDAR_ERROR_CODE.OUT_OF_COVERAGE,
    })
  })
})
