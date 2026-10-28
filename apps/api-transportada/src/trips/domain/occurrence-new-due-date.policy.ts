/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A nova data de vencimento que o motorista informa no pedido de prorrogação do boleto: opcional, dia civil
 * (`AAAA-MM-DD`), nunca no passado (o dia de hoje vale). Pura.
 *
 * ⚠️ **Tipo que não pede a data não a grava — e não a recusa:** mesmo critério dos campos desligados da 247. O app com
 * cache velho ainda manda o valor, e recusá-lo travaria a fila offline quando a configuração muda.
 */
import { TripOccurrenceNewDueDateInPastError } from './trip.error.js'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u
const TODAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
})

/** `AAAA-MM-DD` que existe no calendário (31/02 não existe). */
export function isRealIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (match === null) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

/** O dia de hoje no horário de Brasília (o servidor roda em UTC), `AAAA-MM-DD`. */
export function brazilianToday(now: Date): string {
  return TODAY_FORMAT.format(now)
}

export function resolveNewDueDate(params: {
  readonly asksNewDueDate: boolean
  readonly now?: Date
  readonly value: string | undefined
}): null | string {
  if (!params.asksNewDueDate || params.value === undefined) return null
  if (params.value < brazilianToday(params.now ?? new Date())) {
    throw new TripOccurrenceNewDueDateInPastError()
  }
  return params.value
}
