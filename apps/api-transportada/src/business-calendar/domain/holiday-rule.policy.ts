/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 RF3/RF4/RF6: confere e expande as regras de feriado estadual e municipal. Toda regra é
 * conferida, inclusive a de outra cidade: dado corrompido no cadastro é recusado, nunca ignorado
 * em silêncio — ignorar faria um feriado sumir da conta sem ninguém saber.
 */
import {
  BRAZILIAN_STATE_IBGE_CODES,
  BUSINESS_CALENDAR_ERROR_CODE,
  BUSINESS_CALENDAR_MAX_RULES,
  CITY_IBGE_CODE_PATTERN,
  HOLIDAY_RECURRENCE,
  MUNICIPAL_HOLIDAY_KIND,
  STATE_IBGE_CODE_LENGTH,
} from './business-calendar.constant.js'
import { BusinessCalendarError } from './business-calendar.error.js'
import type {
  BusinessCalendarCoverage,
  CivilDate,
  HolidayOccurrence,
  MunicipalHolidayKind,
  MunicipalHolidayRule,
  StateHolidayRule,
} from './business-calendar.types.js'
import {
  daysInMonth,
  formatCivilDate,
  isValidMonthDay,
  tryToDayNumber,
} from './civil-date.policy.js'

const MUNICIPAL_HOLIDAY_KINDS: ReadonlySet<MunicipalHolidayKind> = new Set(
  Object.values(MUNICIPAL_HOLIDAY_KIND),
)

type HolidayRulesParams = {
  readonly municipalRules: readonly MunicipalHolidayRule[]
  readonly stateRules: readonly StateHolidayRule[]
}

type ExpandOccurrenceParams = {
  readonly coverage: BusinessCalendarCoverage
  readonly occurrence: HolidayOccurrence
}

function unknownStateError(): BusinessCalendarError {
  return new BusinessCalendarError({
    code: BUSINESS_CALENDAR_ERROR_CODE.UNKNOWN_STATE,
    message: 'State IBGE code is not one of the 27 Brazilian states',
  })
}

function invalidRuleError(): BusinessCalendarError {
  return new BusinessCalendarError({
    code: BUSINESS_CALENDAR_ERROR_CODE.INVALID_RULE,
    message: 'Holiday rule has an invalid kind or an inexistent date',
  })
}

/** A UF são os dois primeiros dígitos do código IBGE da cidade (RF6). */
export function resolveStateIbgeCode(cityIbgeCode: string): string {
  if (!CITY_IBGE_CODE_PATTERN.test(cityIbgeCode)) {
    throw new BusinessCalendarError({
      code: BUSINESS_CALENDAR_ERROR_CODE.INVALID_CITY,
      message: 'City IBGE code must have seven digits',
    })
  }

  const stateIbgeCode = cityIbgeCode.slice(0, STATE_IBGE_CODE_LENGTH)
  if (!BRAZILIAN_STATE_IBGE_CODES.has(stateIbgeCode)) throw unknownStateError()
  return stateIbgeCode
}

function isValidOccurrence(occurrence: HolidayOccurrence): boolean {
  if (occurrence.recurrence === HOLIDAY_RECURRENCE.ONCE)
    return tryToDayNumber(occurrence.date) !== undefined
  if (occurrence.recurrence === HOLIDAY_RECURRENCE.YEARLY) return isValidMonthDay(occurrence)
  return false
}

export function assertHolidayRules({ municipalRules, stateRules }: HolidayRulesParams): void {
  if (municipalRules.length + stateRules.length > BUSINESS_CALENDAR_MAX_RULES) {
    throw new BusinessCalendarError({
      code: BUSINESS_CALENDAR_ERROR_CODE.TOO_MANY_RULES,
      message: `A calendar accepts at most ${String(BUSINESS_CALENDAR_MAX_RULES)} holiday rules`,
    })
  }

  for (const rule of municipalRules) {
    resolveStateIbgeCode(rule.cityIbgeCode)
    if (!MUNICIPAL_HOLIDAY_KINDS.has(rule.kind)) throw invalidRuleError()
    if (!isValidOccurrence(rule.occurrence)) throw invalidRuleError()
  }

  for (const rule of stateRules) {
    if (!BRAZILIAN_STATE_IBGE_CODES.has(rule.stateIbgeCode)) throw unknownStateError()
    if (!isValidOccurrence(rule.occurrence)) throw invalidRuleError()
  }
}

export function listCoveredYears(coverage: BusinessCalendarCoverage): readonly number[] {
  return Array.from(
    { length: coverage.toYear - coverage.fromYear + 1 },
    (_, index) => coverage.fromYear + index,
  )
}

/**
 * `once` vale só na data gravada; `yearly` vale todo ano da cobertura, sem ano inicial. 29/02 só
 * existe em ano bissexto — não cai em 28/02 nem em 01/03.
 */
export function expandOccurrence({
  coverage,
  occurrence,
}: ExpandOccurrenceParams): readonly CivilDate[] {
  if (occurrence.recurrence === HOLIDAY_RECURRENCE.ONCE) {
    const year = Number(occurrence.date.slice(0, 4))
    return year >= coverage.fromYear && year <= coverage.toYear ? [occurrence.date] : []
  }

  const { day, month } = occurrence
  return listCoveredYears(coverage)
    .filter((year) => day <= daysInMonth({ month, year }))
    .map((year) => formatCivilDate({ day, month, year }))
}
