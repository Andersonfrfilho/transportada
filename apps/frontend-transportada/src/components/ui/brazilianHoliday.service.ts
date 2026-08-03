/* Copyright (c) 2026 Ada Technology. MIT License. */

export type BrazilianHoliday = Readonly<{ date: string; name: string }>

const FIXED_HOLIDAYS: readonly Readonly<{ day: number; month: number; name: string }>[] = [
  { day: 1, month: 1, name: 'Confraternizacao Universal' },
  { day: 21, month: 4, name: 'Tiradentes' },
  { day: 1, month: 5, name: 'Dia do Trabalho' },
  { day: 7, month: 9, name: 'Independencia do Brasil' },
  { day: 12, month: 10, name: 'Nossa Senhora Aparecida' },
  { day: 2, month: 11, name: 'Finados' },
  { day: 15, month: 11, name: 'Proclamacao da Republica' },
  { day: 20, month: 11, name: 'Consciencia Negra' },
  { day: 25, month: 12, name: 'Natal' },
]

const MOVABLE_HOLIDAYS: readonly Readonly<{ easterOffset: number; name: string }>[] = [
  { easterOffset: -48, name: 'Carnaval' },
  { easterOffset: -47, name: 'Carnaval' },
  { easterOffset: -2, name: 'Sexta-feira Santa' },
  { easterOffset: 60, name: 'Corpus Christi' },
]

const holidaysByYear = new Map<number, readonly BrazilianHoliday[]>()

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toIso(date: Date): string {
  return `${String(date.getUTCFullYear())}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Algoritmo de Meeus/Jones/Butcher para a Pascoa no calendario gregoriano. */
function resolveEaster(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

function shiftDays(reference: Date, days: number): Date {
  return new Date(reference.getTime() + days * 86400000)
}

export function listBrazilianHolidays(year: number): readonly BrazilianHoliday[] {
  const cached = holidaysByYear.get(year)
  if (cached !== undefined) return cached

  const easter = resolveEaster(year)
  const holidays: BrazilianHoliday[] = [
    ...FIXED_HOLIDAYS.map((holiday) => ({
      date: `${String(year)}-${pad(holiday.month)}-${pad(holiday.day)}`,
      name: holiday.name,
    })),
    ...MOVABLE_HOLIDAYS.map((holiday) => ({
      date: toIso(shiftDays(easter, holiday.easterOffset)),
      name: holiday.name,
    })),
  ].sort((left, right) => left.date.localeCompare(right.date))

  holidaysByYear.set(year, holidays)
  return holidays
}

export function findBrazilianHoliday(isoDate: string): string | undefined {
  if (isoDate.length < 10) return undefined
  const year = Number(isoDate.slice(0, 4))
  if (!Number.isInteger(year)) return undefined
  return listBrazilianHolidays(year).find((holiday) => holiday.date === isoDate)?.name
}

export function listBrazilianHolidaysOfMonth(
  year: number,
  month: number,
): readonly BrazilianHoliday[] {
  const prefix = `${String(year)}-${pad(month + 1)}-`
  return listBrazilianHolidays(year).filter((holiday) => holiday.date.startsWith(prefix))
}
