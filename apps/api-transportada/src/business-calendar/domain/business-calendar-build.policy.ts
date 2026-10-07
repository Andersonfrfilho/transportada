/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 RF6: o calendário de uma cidade = nacionais ∪ estaduais da UF ∪ municipais da cidade,
 * expandidos para os anos da cobertura. Feriado em fim de semana não é transferido, e duas causas
 * no mesmo dia contam uma vez: a data guarda a lista das causas.
 */
import {
  BUSINESS_CALENDAR_ERROR_CODE,
  BUSINESS_CALENDAR_MAX_COVERAGE_SPAN_YEARS,
} from './business-calendar.constant.js'
import { BusinessCalendarError } from './business-calendar.error.js'
import type {
  BuildBusinessCalendarParams,
  BusinessCalendar,
  BusinessCalendarCoverage,
  CivilDate,
  HolidayReason,
} from './business-calendar.types.js'
import { isCalendarYear } from './civil-date.policy.js'
import {
  assertHolidayRules,
  expandOccurrence,
  listCoveredYears,
  resolveStateIbgeCode,
} from './holiday-rule.policy.js'
import { listNationalHolidays } from './national-holiday.policy.js'

type ReasonsByDate = Map<CivilDate, HolidayReason[]>

type AppendReasonParams = {
  readonly date: CivilDate
  readonly reason: HolidayReason
  readonly reasonsByDate: ReasonsByDate
}

function assertCoverage({ fromYear, toYear }: BusinessCalendarCoverage): void {
  if (!isCalendarYear(fromYear) || !isCalendarYear(toYear) || fromYear > toYear) {
    throw new BusinessCalendarError({
      code: BUSINESS_CALENDAR_ERROR_CODE.INVALID_COVERAGE,
      message: 'Coverage must go from a Gregorian year to the same or a later one',
    })
  }

  if (toYear - fromYear > BUSINESS_CALENDAR_MAX_COVERAGE_SPAN_YEARS) {
    throw new BusinessCalendarError({
      code: BUSINESS_CALENDAR_ERROR_CODE.COVERAGE_TOO_WIDE,
      message: `Coverage spans at most ${String(BUSINESS_CALENDAR_MAX_COVERAGE_SPAN_YEARS)} years`,
    })
  }
}

function appendReason({ date, reason, reasonsByDate }: AppendReasonParams): void {
  const reasons = reasonsByDate.get(date)
  if (reasons === undefined) {
    reasonsByDate.set(date, [reason])
    return
  }
  reasons.push(reason)
}

function freezeReasons(
  reasonsByDate: ReasonsByDate,
): ReadonlyMap<CivilDate, readonly HolidayReason[]> {
  return new Map([...reasonsByDate].map(([date, reasons]) => [date, Object.freeze([...reasons])]))
}

export function buildBusinessCalendar(params: BuildBusinessCalendarParams): BusinessCalendar {
  const { cityIbgeCode, coverage, municipalRules, saturdayIsBusinessDay, stateRules } = params
  assertCoverage(coverage)
  const stateIbgeCode = resolveStateIbgeCode(cityIbgeCode)
  assertHolidayRules({ municipalRules, stateRules })

  const reasonsByDate: ReasonsByDate = new Map()
  for (const year of listCoveredYears(coverage)) {
    for (const { date, key } of listNationalHolidays(year)) {
      appendReason({ date, reason: { key, source: 'national' }, reasonsByDate })
    }
  }

  for (const rule of stateRules.filter((candidate) => candidate.stateIbgeCode === stateIbgeCode)) {
    for (const date of expandOccurrence({ coverage, occurrence: rule.occurrence })) {
      appendReason({ date, reason: { name: rule.name, source: 'state' }, reasonsByDate })
    }
  }

  for (const rule of municipalRules.filter(
    (candidate) => candidate.cityIbgeCode === cityIbgeCode,
  )) {
    const reason: HolidayReason = { kind: rule.kind, name: rule.name, source: 'municipal' }
    for (const date of expandOccurrence({ coverage, occurrence: rule.occurrence })) {
      appendReason({ date, reason, reasonsByDate })
    }
  }

  return Object.freeze({
    cityIbgeCode,
    coverage: Object.freeze({ fromYear: coverage.fromYear, toYear: coverage.toYear }),
    reasonsByDate: freezeReasons(reasonsByDate),
    saturdayIsBusinessDay,
  })
}
