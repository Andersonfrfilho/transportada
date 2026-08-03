/* Copyright (c) 2026 Ada Technology. MIT License. */

export type ViewMonth = Readonly<{ month: number; year: number }>

const MONTH_FORMATTER = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
const DISPLAY_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year)}-${pad(month + 1)}-${pad(day)}`
}

export function isoToViewMonth(value: string): ViewMonth | null {
  if (value.length < 7) return null
  return { month: Number(value.slice(5, 7)) - 1, year: Number(value.slice(0, 4)) }
}

export function currentViewMonth(): ViewMonth {
  const now = new Date()
  return { month: now.getMonth(), year: now.getFullYear() }
}

export function shiftViewMonth(view: ViewMonth, delta: number): ViewMonth {
  const total = view.year * 12 + view.month + delta
  return { month: ((total % 12) + 12) % 12, year: Math.floor(total / 12) }
}

/** Os `null` da frente alinham o dia 1 com o dia da semana correto na grade. */
export function buildMonthCells(view: ViewMonth): readonly (number | null)[] {
  const firstWeekday = new Date(view.year, view.month, 1).getDay()
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let blank = 0; blank < firstWeekday; blank += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day)
  return cells
}

export function weekdayHeaders(): readonly string[] {
  const headers: string[] = []
  for (let index = 0; index < 7; index += 1) {
    const reference = new Date(2023, 0, 1 + index)
    headers.push(WEEKDAY_FORMATTER.format(reference).replace('.', ''))
  }
  return headers
}

export function formatMonthTitle(view: ViewMonth): string {
  return MONTH_FORMATTER.format(new Date(view.year, view.month, 1))
}

export function formatIsoDisplay(value: string): string {
  return DISPLAY_FORMATTER.format(new Date(`${value}T00:00:00`))
}
