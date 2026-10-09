/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Só `Date.UTC` e getters `getUTC*`: `new Date('2026-10-09')` e os getters locais mudam o dia conforme
 * o fuso do processo, e uma data civil não tem fuso.
 */
const PROVIDER_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/u

/** `DD/MM/AAAA` do fornecedor para `AAAA-MM-DD`; `undefined` quando a data não existe ou não tem a forma. */
export function parseProviderDate(text: string): string | undefined {
  const match = PROVIDER_DATE_PATTERN.exec(text)
  if (match === null) return undefined

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const instant = new Date(Date.UTC(year, month - 1, day))

  const isSameDate =
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day
  if (!isSameDate) return undefined

  return `${match[3]}-${match[2]}-${match[1]}`
}
