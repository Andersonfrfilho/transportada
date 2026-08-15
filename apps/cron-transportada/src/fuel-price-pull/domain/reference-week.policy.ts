/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A semana da ANP vai de domingo a sábado e dá nome ao arquivo — a URL é derivada, não descoberta.
 * Não há `Last-Modified` nem `HEAD` barato (403 mesmo com User-Agent de navegador): o frescor sai
 * da própria coluna de data, que chega em serial Excel de época 1899-12-30.
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

export function resolveReferenceWeek(input: { readonly today: Date }): ReferenceWeek {
  const midnight = Date.UTC(
    input.today.getUTCFullYear(),
    input.today.getUTCMonth(),
    input.today.getUTCDate(),
  )
  const startingAt = midnight - input.today.getUTCDay() * DAY_IN_MILLISECONDS

  return {
    endingOn: toIsoDate(startingAt + (DAYS_IN_WEEK - 1) * DAY_IN_MILLISECONDS),
    startingOn: toIsoDate(startingAt),
  }
}

export function buildWeeklyWorkbookPath(input: ReferenceWeek): string {
  const year = input.startingOn.slice(0, 4)

  return `arquivos-lpc/${year}/resumo_semanal_lpc_${input.startingOn}_${input.endingOn}.xlsx`
}
