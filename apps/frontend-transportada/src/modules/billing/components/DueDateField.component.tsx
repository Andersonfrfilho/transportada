/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/ui/date-picker'
import { Select, type SelectOption } from '@/components/ui/select'

import {
  BILLING_DUE_DATE_TERMS,
  resolveDueDateFromTerm,
  resolveTermFromDueDate,
  todayIsoDate,
} from '../shared/billingDueDate.service'

import styles from './DueDateField.module.css'

export type DueDateFieldProps = Readonly<{
  invalid?: boolean
  onChange: (value: string) => void
  value: string
}>

export function DueDateField({ invalid, onChange, value }: DueDateFieldProps): JSX.Element {
  const { t } = useTranslation('billingWorkspace')
  const today = todayIsoDate()
  const options = useMemo<readonly SelectOption[]>(
    () =>
      BILLING_DUE_DATE_TERMS.map((days) => ({
        label: t('dueDate.termOption', { days }),
        value: String(days),
      })),
    [t],
  )
  const term = resolveTermFromDueDate({ dueDate: value, today })

  function handleTermChange(selected: string): void {
    if (selected === '') {
      onChange('')
      return
    }
    onChange(resolveDueDateFromTerm({ days: Number(selected), today }))
  }

  return (
    <div aria-invalid={invalid === true} className={styles.field}>
      <span className={styles.label}>{t('dueDate.label')}</span>
      <div className={styles.controls}>
        <DatePicker
          ariaLabel={t('dueDate.date')}
          chooseYearLabel={t('dueDate.chooseYear')}
          clearLabel={t('dueDate.clear')}
          nextMonthLabel={t('dueDate.nextMonth')}
          onChange={onChange}
          openCalendarLabel={t('dueDate.openCalendar')}
          placeholder={t('dueDate.datePlaceholder')}
          previousMonthLabel={t('dueDate.previousMonth')}
          value={value}
        />
        <Select
          ariaLabel={t('dueDate.term')}
          clearable
          compact
          onChange={handleTermChange}
          options={options}
          placeholder={t('dueDate.termPlaceholder')}
          value={term === null ? '' : String(term)}
        />
      </div>
    </div>
  )
}
