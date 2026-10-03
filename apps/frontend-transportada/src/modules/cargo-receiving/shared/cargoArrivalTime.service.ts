/* Copyright (c) 2026 Ada Technology. MIT License. */

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/u
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u
const NON_DIGITS = /\D/gu
const TIME_DIGITS = 4
const HOUR_DIGITS = 2

/** Digitar `1430` vira `14:30`; o que passa de quatro dígitos é descartado. */
export function maskTypedTime(typed: string): string {
  const digits = typed.replace(NON_DIGITS, '').slice(0, TIME_DIGITS)
  if (digits.length <= HOUR_DIGITS) return digits
  return `${digits.slice(0, HOUR_DIGITS)}:${digits.slice(HOUR_DIGITS)}`
}

export function isValidTime(time: string): boolean {
  return TIME_PATTERN.test(time)
}

const pad = (value: number): string => String(value).padStart(2, '0')

export function formatLocalDate(moment: Date): string {
  return `${String(moment.getFullYear())}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`
}

export function formatLocalTime(moment: Date): string {
  return `${pad(moment.getHours())}:${pad(moment.getMinutes())}`
}

/**
 * Data e hora digitadas são do fuso do navegador (a chegada é "agora, aqui"). Dia que não existe
 * (31/02) não vira o dia seguinte em silêncio: devolve `undefined`.
 */
export function resolveArrivalMoment(
  input: Readonly<{ date: string; time: string }>,
): Date | undefined {
  const dateMatch = DATE_PATTERN.exec(input.date)
  const timeMatch = TIME_PATTERN.exec(input.time)
  if (dateMatch === null || timeMatch === null) return undefined
  const [year, month, day] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])]
  const moment = new Date(year, month - 1, day, Number(timeMatch[1]), Number(timeMatch[2]))
  const isSameDay =
    moment.getFullYear() === year && moment.getMonth() === month - 1 && moment.getDate() === day
  return isSameDay ? moment : undefined
}
