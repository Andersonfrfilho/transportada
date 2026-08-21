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

const MINIMUM_YEAR_OFFSET = 100
const MAXIMUM_YEAR_OFFSET = 20
const MINIMUM_YEAR = new Date().getFullYear() - MINIMUM_YEAR_OFFSET
const MAXIMUM_YEAR = new Date().getFullYear() + MAXIMUM_YEAR_OFFSET

export function isoToDisplayDate(value: string): string {
  if (value.length < 10) return ''
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`
}

/** A data é digitada por dígito: a barra entra sozinha para o ano não ser lido como dia. */
export function maskTypedDate(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/** Só data que existe de fato vira ISO — 31/02 e 00/00 voltam nulas em vez de virar outro mês. */
export function parseDisplayDate(display: string): string | null {
  const digits = display.replace(/\D/g, '')
  if (digits.length !== 8) return null
  const day = Number(digits.slice(0, 2))
  const month = Number(digits.slice(2, 4))
  const year = Number(digits.slice(4, 8))
  if (month < 1 || month > 12 || day < 1 || year < MINIMUM_YEAR || year > MAXIMUM_YEAR) return null
  if (day > new Date(year, month, 0).getDate()) return null
  return toIsoDate(year, month - 1, day)
}

/** Do mais recente para o mais antigo: data de nascimento e validade de CNH ficam perto do topo. */
export function buildYearChoices(): readonly number[] {
  const years: number[] = []
  for (let year = MAXIMUM_YEAR; year >= MINIMUM_YEAR; year -= 1) years.push(year)
  return years
}
