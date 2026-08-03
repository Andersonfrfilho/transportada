/* Copyright (c) 2026 Ada Technology. MIT License. */

export const BILLING_DUE_DATE_TERMS: readonly number[] = [5, 10, 15, 20, 30]

const MILLISECONDS_IN_A_DAY = 86400000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** UTC no calculo: fuso local deslocaria o vencimento em um dia perto da virada. */
function parseIsoDate(value: string): Date | null {
  if (value.length < 10) return null
  const timestamp = Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`)
  return Number.isFinite(timestamp) ? new Date(timestamp) : null
}

function toIsoDate(date: Date): string {
  return `${String(date.getUTCFullYear())}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function resolveDueDateFromTerm(input: Readonly<{ days: number; today: string }>): string {
  const reference = parseIsoDate(input.today)
  if (reference === null) return ''
  return toIsoDate(new Date(reference.getTime() + input.days * MILLISECONDS_IN_A_DAY))
}

export function resolveTermFromDueDate(
  input: Readonly<{ dueDate: string; today: string }>,
): number | null {
  const dueDate = parseIsoDate(input.dueDate)
  const reference = parseIsoDate(input.today)
  if (dueDate === null || reference === null) return null
  const days = Math.round((dueDate.getTime() - reference.getTime()) / MILLISECONDS_IN_A_DAY)
  return BILLING_DUE_DATE_TERMS.includes(days) ? days : null
}

export function todayIsoDate(): string {
  const now = new Date()
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
