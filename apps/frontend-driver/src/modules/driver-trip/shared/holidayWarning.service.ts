/* Copyright (c) 2026 Ada Technology. MIT License. */
import { driverClockOffset } from './clockOffset.service'
import type { HolidayReason, HolidayWarning } from './driverTrip.types'
import { HOLIDAY_TIME_ZONE } from './holidayWarning.constant'

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u
const SAO_PAULO_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: HOLIDAY_TIME_ZONE,
  year: 'numeric',
})

export type HolidayNoticeLine = Readonly<{
  cityName?: string
  /** `DD/MM` — o ano não ajuda o motorista a decidir. */
  dateLabel: string
  isToday: boolean
  reasons: readonly HolidayReason[]
}>

/** `YYYY-MM-DD` do dia em São Paulo — `en-CA` já formata assim, sem montar partes à mão. */
export function resolveSaoPauloCivilDate(nowMs: number): string {
  return SAO_PAULO_DATE_FORMAT.format(nowMs)
}

export function applyClockOffset(input: {
  readonly deviceNowMs: number
  readonly offsetMs: number | undefined
}): number {
  return input.deviceNowMs + (input.offsetMs ?? 0)
}

/** O relógio do aparelho corrigido pelo último desvio medido (`clockOffset.service.ts`); sem medida, o do aparelho. */
export function readCorrectedNowMs(): number {
  return applyClockOffset({ deviceNowMs: Date.now(), offsetMs: driverClockOffset.read() })
}

/** Data fora do formato ou impossível não vira texto: o aviso é acessório e não inventa. */
function toDateLabel(date: string): string | undefined {
  const [, , monthText, dayText] = CIVIL_DATE_PATTERN.exec(date) ?? []
  if (monthText === undefined || dayText === undefined) return undefined
  const month = Number(monthText)
  const day = Number(dayText)
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  return `${dayText}/${monthText}`
}

function toLine(input: {
  readonly today: string
  readonly warning: HolidayWarning
}): HolidayNoticeLine | undefined {
  const { today, warning } = input
  const dateLabel = toDateLabel(warning.date)
  if (dateLabel === undefined || warning.date < today) return undefined
  const cityName = warning.cityName?.trim() ?? ''

  return {
    ...(cityName === '' ? {} : { cityName }),
    dateLabel,
    isToday: warning.date === today,
    reasons: warning.reasons,
  }
}

/** Os avisos que ainda valem no relógio corrigido, na ordem em que o servidor mandou. */
export function listHolidayNoticeLines(input: {
  readonly nowMs: number
  readonly warnings: readonly HolidayWarning[] | undefined
}): readonly HolidayNoticeLine[] {
  const today = resolveSaoPauloCivilDate(input.nowMs)

  return (input.warnings ?? []).flatMap((warning) => toLine({ today, warning }) ?? [])
}
