/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Toda decisão de data da rotina parte de um relógio injetado: o dia é o **civil de São Paulo** (D7),
 * o mês do orçamento é o de São Paulo, e o horizonte (D8) é o ano corrente e o seguinte.
 */
import {
  HOLIDAY_PROVIDER_FAILURE_BACKOFF_HOURS,
  HOLIDAY_PROVIDER_TIME_ZONE,
  HOLIDAY_PROVIDER_UTC_OFFSET,
} from './holiday-provider-pull.constant.js'

const MILLISECONDS_PER_HOUR = 3_600_000
const MILLISECONDS_PER_DAY = 86_400_000
const MONTHS_PER_YEAR = 12

const civilDateFormat = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: HOLIDAY_PROVIDER_TIME_ZONE,
  year: 'numeric',
})

/** `AAAA-MM-DD` do dia de São Paulo em que o instante cai. */
export function resolveSaoPauloCivilDate(now: Date): string {
  return civilDateFormat.format(now)
}

function readYearAndMonth(now: Date): { readonly month: number; readonly year: number } {
  const [year = '0', month = '0'] = resolveSaoPauloCivilDate(now).split('-')
  return { month: Number(month), year: Number(year) }
}

export function resolveHorizonYears(now: Date): readonly [number, number] {
  const { year } = readYearAndMonth(now)
  return [year, year + 1]
}

/** O mês do orçamento, sempre no dia 1º (a CHECK `holiday_provider_monthly_usage_month_check`). */
export function resolveBudgetMonth(now: Date): string {
  const { month, year } = readYearAndMonth(now)
  return `${year}-${String(month).padStart(2, '0')}-01`
}

/** A cota esgotada vale até a meia-noite do dia 1º do mês seguinte, em São Paulo. */
export function resolveNextMonthStart(now: Date): Date {
  const { month, year } = readYearAndMonth(now)
  const nextYear = month === MONTHS_PER_YEAR ? year + 1 : year
  const nextMonth = month === MONTHS_PER_YEAR ? 1 : month + 1
  return new Date(
    `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00${HOLIDAY_PROVIDER_UTC_OFFSET}`,
  )
}

export function addDays(input: { readonly date: Date; readonly days: number }): Date {
  return new Date(input.date.getTime() + input.days * MILLISECONDS_PER_DAY)
}

export function addSeconds(input: { readonly date: Date; readonly seconds: number }): Date {
  return new Date(input.date.getTime() + input.seconds * 1000)
}

/** `failedAttempts` é a contagem depois desta falha (a 1ª falha vale 1). */
export function resolveFailureNextAttemptAt(input: {
  readonly failedAttempts: number
  readonly now: Date
}): Date {
  const schedule = HOLIDAY_PROVIDER_FAILURE_BACKOFF_HOURS
  const index = Math.min(Math.max(input.failedAttempts, 1), schedule.length) - 1
  const hours = schedule[index] ?? schedule[schedule.length - 1] ?? 1
  return new Date(input.now.getTime() + hours * MILLISECONDS_PER_HOUR)
}
