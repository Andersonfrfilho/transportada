/* Copyright (c) 2026 Ada Technology. MIT License. */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Vencimento é dia de calendário: ler em UTC evita o recuo de um dia em fusos negativos. */
export function formatCalendarDate(value: string): string {
  const moment = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value)
  if (Number.isNaN(moment.getTime())) return value
  return `${pad(moment.getUTCDate())}/${pad(moment.getUTCMonth() + 1)}/${String(moment.getUTCFullYear())}`
}
