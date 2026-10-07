/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.1: a data civil vira um inteiro (dias desde 1970-01-01) e volta. Só `Date.UTC` e
 * getters `getUTC*`: `new Date('2026-10-09')` e os getters locais mudam o dia conforme o fuso do
 * processo, e a política não pode ter fuso nenhum.
 */
import {
  BUSINESS_CALENDAR_ERROR_CODE,
  BUSINESS_CALENDAR_MAX_YEAR,
  BUSINESS_CALENDAR_MIN_YEAR,
} from './business-calendar.constant.js'
import { BusinessCalendarError } from './business-calendar.error.js'
import type { CivilDate } from './business-calendar.types.js'

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MILLISECONDS_PER_DAY = 86_400_000
const LEAP_REFERENCE_YEAR = 2000

export const SUNDAY = 0
export const SATURDAY = 6

export type CivilDateParts = {
  readonly day: number
  readonly month: number
  readonly year: number
}

function padNumber({ value, width }: { readonly value: number; readonly width: number }): string {
  return String(value).padStart(width, '0')
}

export function formatCivilDate({ day, month, year }: CivilDateParts): CivilDate {
  return `${padNumber({ value: year, width: 4 })}-${padNumber({ value: month, width: 2 })}-${padNumber({ value: day, width: 2 })}`
}

/** Só para partes já conferidas: dia fora do mês transbordaria para o mês seguinte. */
export function dayNumberOf({ day, month, year }: CivilDateParts): number {
  return Date.UTC(year, month - 1, day) / MILLISECONDS_PER_DAY
}

export function fromDayNumber(dayNumber: number): CivilDate {
  const instant = new Date(dayNumber * MILLISECONDS_PER_DAY)
  return formatCivilDate({
    day: instant.getUTCDate(),
    month: instant.getUTCMonth() + 1,
    year: instant.getUTCFullYear(),
  })
}

/** 0 é domingo, 6 é sábado — a numeração de `getUTCDay`. */
export function weekdayOf(dayNumber: number): number {
  return new Date(dayNumber * MILLISECONDS_PER_DAY).getUTCDay()
}

export function daysInMonth({ month, year }: Pick<CivilDateParts, 'month' | 'year'>): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Regra anual se confere num ano bissexto: 29/02 é válido, e só existe nos anos que o têm. */
export function isValidMonthDay({ day, month }: Pick<CivilDateParts, 'day' | 'month'>): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false
  if (!Number.isInteger(day) || day < 1) return false
  return day <= daysInMonth({ month, year: LEAP_REFERENCE_YEAR })
}

/** Confere o formato e a data de volta: `2027-02-29` e `2026-13-01` não existem. */
export function tryToDayNumber(text: unknown): number | undefined {
  if (typeof text !== 'string') return undefined
  const match = CIVIL_DATE_PATTERN.exec(text)
  if (match === null) return undefined

  const dayNumber = dayNumberOf({
    day: Number(match[3]),
    month: Number(match[2]),
    year: Number(match[1]),
  })
  return fromDayNumber(dayNumber) === text ? dayNumber : undefined
}

export function toDayNumber(date: CivilDate): number {
  const dayNumber = tryToDayNumber(date)
  if (dayNumber === undefined) {
    throw new BusinessCalendarError({
      code: BUSINESS_CALENDAR_ERROR_CODE.INVALID_DATE,
      message: 'Date must be an existing civil date in the YYYY-MM-DD format',
    })
  }
  return dayNumber
}

export function parseCivilDate(text: string): CivilDate {
  toDayNumber(text)
  return text
}

export function isCalendarYear(year: number): boolean {
  return (
    Number.isInteger(year) &&
    year >= BUSINESS_CALENDAR_MIN_YEAR &&
    year <= BUSINESS_CALENDAR_MAX_YEAR
  )
}
