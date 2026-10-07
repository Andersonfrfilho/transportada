/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 RF2: o feriado nacional é lei, não dado do cliente — mora no código. A lista é a do
 * calendário do painel (`brazilianHoliday.service.ts`), presa por contrato de paridade de datas.
 * Sem cache: a lista de um ano custa treze contas, e um cache de módulo sem limite cresceria com
 * todo ano que alguém pedisse.
 */
import {
  BUSINESS_CALENDAR_ERROR_CODE,
  EASTER_RELATIVE_NATIONAL_HOLIDAYS,
  FIXED_NATIONAL_HOLIDAYS,
} from './business-calendar.constant.js'
import { BusinessCalendarError } from './business-calendar.error.js'
import type { NationalHoliday } from './business-calendar.types.js'
import { dayNumberOf, formatCivilDate, fromDayNumber, isCalendarYear } from './civil-date.policy.js'

/** Algoritmo de Meeus/Jones/Butcher para o domingo de Páscoa no calendário gregoriano. */
function resolveEasterDayNumber(year: number): number {
  const goldenNumber = year % 19
  const century = Math.floor(year / 100)
  const yearOfCentury = year % 100
  const centuryLeapQuotient = Math.floor(century / 4)
  const centuryLeapRemainder = century % 4
  const lunarCorrection = Math.floor((century + 8) / 25)
  const solarCorrection = Math.floor((century - lunarCorrection + 1) / 3)
  const epact = (19 * goldenNumber + century - centuryLeapQuotient - solarCorrection + 15) % 30
  const yearLeapQuotient = Math.floor(yearOfCentury / 4)
  const yearLeapRemainder = yearOfCentury % 4
  const weekdayOffset =
    (32 + 2 * centuryLeapRemainder + 2 * yearLeapQuotient - epact - yearLeapRemainder) % 7
  const paschalCorrection = Math.floor((goldenNumber + 11 * epact + 22 * weekdayOffset) / 451)
  const monthAndDay = epact + weekdayOffset - 7 * paschalCorrection + 114

  return dayNumberOf({ day: (monthAndDay % 31) + 1, month: Math.floor(monthAndDay / 31), year })
}

/** Ordenada por data; no mesmo dia, os fixos antes dos móveis (como no painel). */
export function listNationalHolidays(year: number): readonly NationalHoliday[] {
  if (!isCalendarYear(year)) {
    throw new BusinessCalendarError({
      code: BUSINESS_CALENDAR_ERROR_CODE.INVALID_COVERAGE,
      message: 'Year must be an integer of the Gregorian calendar',
    })
  }

  const easterDayNumber = resolveEasterDayNumber(year)
  const holidays: NationalHoliday[] = [
    ...FIXED_NATIONAL_HOLIDAYS.map(({ day, key, month }) => ({
      date: formatCivilDate({ day, month, year }),
      key,
    })),
    ...EASTER_RELATIVE_NATIONAL_HOLIDAYS.map(({ easterOffsetDays, key }) => ({
      date: fromDayNumber(easterDayNumber + easterOffsetDays),
      key,
    })),
  ]

  return holidays.toSorted((left, right) => left.date.localeCompare(right.date))
}
