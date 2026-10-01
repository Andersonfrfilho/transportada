/* Copyright (c) 2026 Ada Technology. MIT License. */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { formatMomentWithLocale } from './momentFormat.service'

export function useMomentFormatter(): (value: string) => string {
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'pt-BR'
  return useMemo(() => (value) => formatMomentWithLocale({ locale, value }), [locale])
}
