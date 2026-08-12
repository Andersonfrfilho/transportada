/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A NFS-e é municipal e o dia que a prefeitura lê é o dia local: uma nota emitida às 22h em São
 * Paulo já é o dia seguinte em UTC, e o período sairia cobrindo um dia que o serviço não cobre.
 */
const SERVICE_TIME_ZONE = 'America/Sao_Paulo'

/** `en-CA` com estas opções devolve `YYYY-MM-DD` — largura fixa, e ordena por comparação de texto. */
const CALENDAR_DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: SERVICE_TIME_ZONE,
  year: 'numeric',
})

const RANGE_SEPARATOR = ' a '

/**
 * A janela do serviço prestado, do primeiro ao último dia da seleção. Vale para a seleção inteira:
 * quando a lista de notas é truncada no texto, o período continua sendo o de todas elas.
 */
export function buildNfsePeriod(issuedAtValues: readonly string[]): string {
  const [first, ...rest] = issuedAtValues.map(resolveCalendarDay)
  if (first === undefined) return ''

  const opening = rest.reduce((earliest, day) => (day < earliest ? day : earliest), first)
  const closing = rest.reduce((latest, day) => (day > latest ? day : latest), first)

  if (opening === closing) return formatDay(opening)

  // O ano do dia inicial é redundante enquanto o período não vira o ano.
  return resolveYear(opening) === resolveYear(closing)
    ? `${formatDayAndMonth(opening)}${RANGE_SEPARATOR}${formatDay(closing)}`
    : `${formatDay(opening)}${RANGE_SEPARATOR}${formatDay(closing)}`
}

function resolveCalendarDay(issuedAt: string): string {
  return CALENDAR_DAY_FORMATTER.format(new Date(issuedAt))
}

function formatDay(calendarDay: string): string {
  return `${formatDayAndMonth(calendarDay)}-${resolveYear(calendarDay)}`
}

function formatDayAndMonth(calendarDay: string): string {
  return `${calendarDay.slice(8, 10)}-${calendarDay.slice(5, 7)}`
}

function resolveYear(calendarDay: string): string {
  return calendarDay.slice(0, 4)
}
