/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 RF1 (ADR-0096): conta dias úteis sobre um calendário já montado. Pura: não lê relógio
 * nem fuso — quem chama passa a data civil. Domingo nunca é útil; sábado só com
 * `saturdayIsBusinessDay`. Toda caminhada para no fim da cobertura: ano não carregado nunca vira
 * "sem feriado", e um calendário sem dia útil termina em erro, não em laço.
 */
import {
  BUSINESS_CALENDAR_ERROR_CODE,
  BUSINESS_CALENDAR_MAX_DAYS,
} from './business-calendar.constant.js'
import { BusinessCalendarError } from './business-calendar.error.js'
import type {
  AddBusinessDaysParams,
  AddBusinessDaysResult,
  BusinessCalendar,
  CalendarDateParams,
  CountBusinessDaysParams,
  CountBusinessDaysResult,
  ExplainDayResult,
} from './business-calendar.types.js'
import {
  SATURDAY,
  SUNDAY,
  dayNumberOf,
  fromDayNumber,
  toDayNumber,
  weekdayOf,
} from './civil-date.policy.js'

export { buildBusinessCalendar } from './business-calendar-build.policy.js'

type DayNumberParams = {
  readonly calendar: BusinessCalendar
  readonly dayNumber: number
}

type DayRangeParams = {
  readonly afterDayNumber: number
  readonly calendar: BusinessCalendar
  readonly throughDayNumber: number
}

function outOfCoverageError(): BusinessCalendarError {
  return new BusinessCalendarError({
    code: BUSINESS_CALENDAR_ERROR_CODE.OUT_OF_COVERAGE,
    message: 'Date is outside the years loaded into the calendar',
  })
}

function lastCoveredDayNumber(calendar: BusinessCalendar): number {
  return dayNumberOf({ day: 31, month: 12, year: calendar.coverage.toYear })
}

function toCoveredDayNumber({ calendar, date }: CalendarDateParams): number {
  const dayNumber = toDayNumber(date)
  const firstCoveredDayNumber = dayNumberOf({ day: 1, month: 1, year: calendar.coverage.fromYear })
  if (dayNumber < firstCoveredDayNumber || dayNumber > lastCoveredDayNumber(calendar)) {
    throw outOfCoverageError()
  }
  return dayNumber
}

function isBusinessDayNumber({ calendar, dayNumber }: DayNumberParams): boolean {
  const weekday = weekdayOf(dayNumber)
  if (weekday === SUNDAY) return false
  if (weekday === SATURDAY && !calendar.saturdayIsBusinessDay) return false
  return !calendar.reasonsByDate.has(fromDayNumber(dayNumber))
}

/** O primeiro dia útil a partir de `dayNumber`, inclusive, sem passar do fim da cobertura. */
function findBusinessDayNumber({ calendar, dayNumber }: DayNumberParams): number {
  const lastDayNumber = lastCoveredDayNumber(calendar)
  for (let candidate = dayNumber; candidate <= lastDayNumber; candidate += 1) {
    if (isBusinessDayNumber({ calendar, dayNumber: candidate })) return candidate
  }
  throw outOfCoverageError()
}

function countBusinessDaysBetween({
  afterDayNumber,
  calendar,
  throughDayNumber,
}: DayRangeParams): number {
  let businessDays = 0
  for (let candidate = afterDayNumber + 1; candidate <= throughDayNumber; candidate += 1) {
    if (isBusinessDayNumber({ calendar, dayNumber: candidate })) businessDays += 1
  }
  return businessDays
}

function resolveWeekend(weekday: number): ExplainDayResult['weekend'] {
  if (weekday === SUNDAY) return 'sunday'
  if (weekday === SATURDAY) return 'saturday'
  return null
}

export function isBusinessDay({ calendar, date }: CalendarDateParams): boolean {
  return isBusinessDayNumber({ calendar, dayNumber: toCoveredDayNumber({ calendar, date }) })
}

export function explainDay({ calendar, date }: CalendarDateParams): ExplainDayResult {
  const dayNumber = toCoveredDayNumber({ calendar, date })
  const weekday = weekdayOf(dayNumber)

  return {
    isBusinessDay: isBusinessDayNumber({ calendar, dayNumber }),
    reasons: calendar.reasonsByDate.get(date) ?? [],
    weekend: resolveWeekend(weekday),
  }
}

/**
 * O dia 0 é a data inicial quando ela é útil; senão, o primeiro dia útil depois dela — sábado + 3
 * cai na quinta, não na quarta como o `WORKDAY` do Excel.
 */
export function addBusinessDays({
  calendar,
  days,
  start,
}: AddBusinessDaysParams): AddBusinessDaysResult {
  if (!Number.isInteger(days) || days < 0 || days > BUSINESS_CALENDAR_MAX_DAYS) {
    throw new BusinessCalendarError({
      code: BUSINESS_CALENDAR_ERROR_CODE.INVALID_DAYS,
      message: `Days must be an integer from 0 to ${String(BUSINESS_CALENDAR_MAX_DAYS)}`,
    })
  }

  const dayZero = findBusinessDayNumber({
    calendar,
    dayNumber: toCoveredDayNumber({ calendar, date: start }),
  })
  let dayNumber = dayZero
  for (let remaining = days; remaining > 0; remaining -= 1) {
    dayNumber = findBusinessDayNumber({ calendar, dayNumber: dayNumber + 1 })
  }

  return { date: fromDayNumber(dayNumber), dayZero: fromDayNumber(dayZero) }
}

/** Dias úteis d com from < d ≤ to; negativo quando to vem antes de from. */
export function countBusinessDays({
  calendar,
  from,
  to,
}: CountBusinessDaysParams): CountBusinessDaysResult {
  const startDayNumber = toCoveredDayNumber({ calendar, date: from })
  const endDayNumber = toCoveredDayNumber({ calendar, date: to })

  if (endDayNumber >= startDayNumber) {
    return {
      businessDays: countBusinessDaysBetween({
        afterDayNumber: startDayNumber,
        calendar,
        throughDayNumber: endDayNumber,
      }),
    }
  }

  const backwards = countBusinessDaysBetween({
    afterDayNumber: endDayNumber,
    calendar,
    throughDayNumber: startDayNumber,
  })
  // `0 - 0` é +0; `-0` reprovaria quem compara com `Object.is`.
  return { businessDays: 0 - backwards }
}
