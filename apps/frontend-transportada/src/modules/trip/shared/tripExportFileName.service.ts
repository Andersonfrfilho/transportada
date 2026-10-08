/* Copyright (c) 2026 Ada Technology. MIT License. */

/** `YYYY-MM-DD` no fuso do navegador: à noite no Brasil o UTC já virou o dia seguinte. */
export function formatLocalIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Sem dado pessoal: a data de hoje é o que distingue um download do outro. */
export function buildTripExportFileName(
  input: Readonly<{ baseName: string; extension: 'pdf' | 'xlsx'; today?: Date }>,
): string {
  return `${input.baseName}-${formatLocalIsoDate(input.today ?? new Date())}.${input.extension}`
}
