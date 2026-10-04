/* Copyright (c) 2026 Ada Technology. MIT License. */

const PLANNED_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u
const NO_VALUE = '—'

/**
 * O dia planejado é uma DATA, sem hora: `new Date('2026-10-05')` seria meia-noite UTC e mostraria o dia
 * anterior no fuso do Brasil. A data é montada no calendário local e formatada sem fuso.
 */
export function formatPlannedDate(
  input: Readonly<{ locale: string; value: string | null }>,
): string {
  if (input.value === null) return NO_VALUE
  const match = PLANNED_DATE_PATTERN.exec(input.value)
  if (match === null) return input.value
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return new Intl.DateTimeFormat(input.locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function formatKilograms(input: Readonly<{ locale: string; value: string | null }>): string {
  if (input.value === null) return NO_VALUE
  const amount = Number(input.value)
  if (!Number.isFinite(amount)) return input.value
  return `${new Intl.NumberFormat(input.locale, { maximumFractionDigits: 2 }).format(amount)} kg`
}

export const formatOptionalText = (value: string | null): string => value ?? NO_VALUE
