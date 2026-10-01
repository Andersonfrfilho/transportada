/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

/** Data curta no idioma da tela — praça, ajuste e catálogo formatam a mesma data do mesmo jeito. */
export function useDayFormatter(): (value: string) => string {
  const { i18n, t } = useTranslation('fleet')
  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'pt-BR', {
    dateStyle: 'short',
    timeZone: 'UTC',
  })
  return (value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime())) return t('tollBoothCharges.unknown')
    return formatter.format(date)
  }
}
