/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
const FISCAL_TIME_ZONE = 'America/Sao_Paulo'

// `en-CA` já formata como YYYY-MM-DD, então não há remontagem de partes de data à mão.
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: FISCAL_TIME_ZONE,
  year: 'numeric',
})

export function formatFiscalDay(instant: Date): string {
  return dayFormatter.format(instant)
}
