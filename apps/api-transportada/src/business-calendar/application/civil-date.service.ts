/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.1: a borda onde um instante vira data civil, no molde de `formatFiscalDay`. O fuso é
 * parâmetro (hoje o de São Paulo, ADR-0096); a política de dias úteis nunca o vê.
 */
import { BUSINESS_CALENDAR_TIME_ZONE } from '../domain/business-calendar.constant.js'
import type { CivilDate } from '../domain/business-calendar.types.js'

type ToCivilDateParams = {
  readonly instant: Date
  readonly timeZone: string
}

/** Construir o formatador custa ~22 µs contra ~0,5 µs guardado; o conjunto de fusos é fixo e pequeno. */
const MAX_CACHED_FORMATTERS = 16
const formattersByTimeZone = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formattersByTimeZone.get(timeZone)
  if (cached !== undefined) return cached

  if (formattersByTimeZone.size >= MAX_CACHED_FORMATTERS) formattersByTimeZone.clear()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  })
  formattersByTimeZone.set(timeZone, formatter)
  return formatter
}

export function toCivilDate({ instant, timeZone }: ToCivilDateParams): CivilDate {
  return getFormatter(timeZone).format(instant)
}

/** O dia de "hoje" do produto: o civil de São Paulo, nunca o de UTC (ADR-0096 Q3). */
export function resolveToday({ now }: { readonly now: Date }): CivilDate {
  return toCivilDate({ instant: now, timeZone: BUSINESS_CALENDAR_TIME_ZONE })
}
