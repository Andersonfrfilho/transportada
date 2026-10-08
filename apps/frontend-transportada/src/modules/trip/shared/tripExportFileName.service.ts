/* Copyright (c) 2026 Ada Technology. MIT License. */

function padTwoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

/** `YYYY-MM-DD-HHmm` no fuso do navegador: à noite no Brasil o UTC já virou o dia seguinte. */
export function formatLocalTimestamp(date: Date): string {
  const day = `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}-${padTwoDigits(date.getDate())}`
  return `${day}-${padTwoDigits(date.getHours())}${padTwoDigits(date.getMinutes())}`
}

/** Sem dado pessoal: data e hora do download distinguem um arquivo do outro. */
export function buildTripExportFileName(
  input: Readonly<{ baseName: string; extension: 'pdf' | 'xlsx'; today?: Date }>,
): string {
  return `${input.baseName}-${formatLocalTimestamp(input.today ?? new Date())}.${input.extension}`
}
