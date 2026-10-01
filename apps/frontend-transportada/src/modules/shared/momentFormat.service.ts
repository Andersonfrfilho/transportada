/* Copyright (c) 2026 Ada Technology. MIT License. */
export type FormatMomentWithLocaleParams = Readonly<{
  locale: string
  value: string
}>

export function formatMomentWithLocale({ locale, value }: FormatMomentWithLocaleParams): string {
  const moment = new Date(value)
  if (Number.isNaN(moment.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(moment)
}
