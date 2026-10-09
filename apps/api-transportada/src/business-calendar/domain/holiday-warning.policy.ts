/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.2 (ADR-0100 §6): o aviso de feriado de um dia numa cidade — pura, sem relógio nem banco. Avisa o
 * dia que não é útil POR FERIADO; fim de semana puro segue no aviso que já existe. O formato é único e é o
 * que o painel e o app do motorista já toleram: `cityIbgeCode` numérico, `cityName` ausente quando não
 * se sabe, e cada causa com escopo, origem e nome. O nome do feriado nacional é a chave estável dele (o
 * texto é do locale de quem mostra).
 */
import type {
  BusinessCalendar,
  CivilDate,
  ExplainDayResult,
  HolidayOrigin,
  HolidayReason,
} from './business-calendar.types.js'
import { explainDay } from './business-calendar.policy.js'

export type HolidayWarningScope = HolidayReason['source']

export type HolidayWarningReason = {
  readonly name: string
  readonly origin: HolidayOrigin
  readonly scope: HolidayWarningScope
}

export type HolidayWarning = {
  readonly cityIbgeCode: number
  readonly cityName?: string
  readonly date: CivilDate
  readonly reasons: readonly HolidayWarningReason[]
}

type BuildHolidayWarningParams = {
  readonly calendar: BusinessCalendar
  readonly cityName?: string
  readonly date: CivilDate
}

function toWarningReason(reason: HolidayReason): HolidayWarningReason {
  return {
    name: reason.source === 'national' ? reason.key : reason.name,
    origin: reason.origin,
    scope: reason.source,
  }
}

/** Domingo nunca é útil; sábado só quando a empresa o conta. Aí o feriado não muda nada. */
function isClosedByWeekend(input: {
  readonly calendar: BusinessCalendar
  readonly day: ExplainDayResult
}): boolean {
  if (input.day.weekend === 'sunday') return true
  return input.day.weekend === 'saturday' && !input.calendar.saturdayIsBusinessDay
}

export function buildHolidayWarning({
  calendar,
  cityName,
  date,
}: BuildHolidayWarningParams): HolidayWarning | undefined {
  const day = explainDay({ calendar, date })
  if (day.reasons.length === 0 || isClosedByWeekend({ calendar, day })) return undefined

  return {
    cityIbgeCode: Number(calendar.cityIbgeCode),
    ...(cityName === undefined || cityName === '' ? {} : { cityName }),
    date,
    reasons: day.reasons.map(toWarningReason),
  }
}
