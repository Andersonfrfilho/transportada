/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

/** Data curta no idioma da tela — praça, ajuste e catálogo formatam a mesma data do mesmo jeito. */
export function useDayFormatter(): (value: string) => string {
  const { i18n } = useTranslation('fleet')
  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'pt-BR', {
    dateStyle: 'short',
    timeZone: 'UTC',
  })
  return (value) => formatter.format(new Date(`${value}T00:00:00.000Z`))
}
