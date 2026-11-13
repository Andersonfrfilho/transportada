/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

/** Rótulos do `DatePicker` do design system, lidos do mesmo vocabulário nas três telas de Contas. */
export function useCalendarLabels() {
  const { t } = useTranslation('expenses')
  return {
    chooseYearLabel: t('calendar.chooseYear'),
    clearLabel: t('calendar.clear'),
    nextMonthLabel: t('calendar.nextMonth'),
    openCalendarLabel: t('calendar.open'),
    placeholder: t('calendar.placeholder'),
    previousMonthLabel: t('calendar.previousMonth'),
  }
}
