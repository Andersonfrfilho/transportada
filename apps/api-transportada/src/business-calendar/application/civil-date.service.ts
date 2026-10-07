/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.1: a borda onde um instante vira data civil, no molde de `formatFiscalDay`. O fuso é
 * parâmetro (hoje o de São Paulo, ADR-0096); a política de dias úteis nunca o vê.
 */
import type { CivilDate } from '../domain/business-calendar.types.js'

type ToCivilDateParams = {
  readonly instant: Date
  readonly timeZone: string
}

export function toCivilDate({ instant, timeZone }: ToCivilDateParams): CivilDate {
  // `en-CA` já formata como YYYY-MM-DD, sem remontar partes de data à mão.
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).format(instant)
}
