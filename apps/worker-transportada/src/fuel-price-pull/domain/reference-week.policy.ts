/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A semana da ANP vai de domingo a sábado e dá nome ao arquivo — a URL é derivada, não descoberta.
 * Não há `Last-Modified` nem `HEAD` barato (403 mesmo com User-Agent de navegador): o frescor sai
 * da própria coluna de data, que chega em serial Excel de época 1899-12-30.
 *
 * O resumo de uma semana só existe depois de ela fechar, então resolve-se sempre a última semana
 * **completa**. Medido em 16/08/2026: a semana corrente devolve 404 e as três anteriores, 200.
 * Derivar a semana que contém hoje falhava em todo dia da semana, inclusive no sábado, onde a
 * semana resolvida terminava às 23:59 daquele mesmo dia.
 */
const DAY_IN_MILLISECONDS = 86_400_000
const DAYS_IN_WEEK = 7
const EXCEL_EPOCH_IN_MILLISECONDS = Date.UTC(1899, 11, 30)
const ISO_DATE_LENGTH = 10

export type ReferenceWeek = {
  readonly endingOn: string
  readonly startingOn: string
}

function toIsoDate(milliseconds: number): string {
  return new Date(milliseconds).toISOString().slice(0, ISO_DATE_LENGTH)
}

export function readExcelSerialDate(input: { readonly serial: number }): string {
  if (!Number.isInteger(input.serial) || input.serial <= 0) {
    throw new Error('ANP_INVALID_SERIAL_DATE')
  }

  return toIsoDate(EXCEL_EPOCH_IN_MILLISECONDS + input.serial * DAY_IN_MILLISECONDS)
}

/**
 * A última semana **completa**, nunca a que contém hoje: o resumo de uma semana só é publicado
 * depois de ela fechar. No sábado o deslocamento é de sete dias, e não zero — a semana que termina
 * naquele mesmo sábado ainda está correndo.
 */
export function resolveReferenceWeek(input: { readonly today: Date }): ReferenceWeek {
  const midnight = Date.UTC(
    input.today.getUTCFullYear(),
    input.today.getUTCMonth(),
    input.today.getUTCDate(),
  )
  const daysSinceLastSaturday = (input.today.getUTCDay() + 1) % DAYS_IN_WEEK || DAYS_IN_WEEK
  const endingAt = midnight - daysSinceLastSaturday * DAY_IN_MILLISECONDS

  return {
    endingOn: toIsoDate(endingAt),
    startingOn: toIsoDate(endingAt - (DAYS_IN_WEEK - 1) * DAY_IN_MILLISECONDS),
  }
}

export function buildWeeklyWorkbookPath(input: ReferenceWeek): string {
  const year = input.startingOn.slice(0, 4)

  return `arquivos-lpc/${year}/resumo_semanal_lpc_${input.startingOn}_${input.endingOn}.xlsx`
}
