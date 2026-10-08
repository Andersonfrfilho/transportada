/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/ui/date-picker'
import { isoToDisplayDate } from '@/components/ui/calendar.service'

import type { HolidayDraftController } from '../hooks/useHolidayDraft.hook'
import { useHolidayFieldIds } from '../hooks/useHolidayFieldIds.hook'
import {
  HOLIDAY_RECURRENCE,
  HOLIDAY_RECURRENCES,
  MONTHS_IN_YEAR,
} from '../shared/businessCalendar.constant'
import styles from '../styles/businessCalendar.module.css'

import { HolidayChoiceField } from './HolidayChoiceField.component'
import { HolidayField } from './HolidayField.component'
import { HolidayTextField } from './HolidayTextField.component'

type HolidayWhenFieldsProps = Readonly<{
  controller: HolidayDraftController
  /** A data fixa de uma linha já gravada é a identidade dela: aparece como texto, não como campo. */
  isDateFixed: boolean
  isRecurrenceLocked: boolean
}>

function monthOptions(label: (month: number) => string) {
  return Array.from({ length: MONTHS_IN_YEAR }, (_, index) => ({
    label: label(index + 1),
    value: String(index + 1),
  }))
}

function HolidayDateField({
  controller,
  isDateFixed,
}: Omit<HolidayWhenFieldsProps, 'isRecurrenceLocked'>) {
  const { t } = useTranslation('businessCalendar')
  const ids = useHolidayFieldIds()
  const { draft, issues } = controller

  return (
    <HolidayField
      field="holidayOn"
      ids={ids}
      issue={issues.holidayOn}
      label={t('fields.holidayOn')}
    >
      {isDateFixed ? (
        <p className={styles.fixedValue}>{isoToDisplayDate(draft.holidayOn)}</p>
      ) : (
        <DatePicker
          ariaLabel={t('form.dateAria')}
          chooseYearLabel={t('form.datePicker.chooseYear')}
          clearLabel={t('form.datePicker.clear')}
          nextMonthLabel={t('form.datePicker.next')}
          onChange={(value) => controller.setText('holidayOn', value)}
          openCalendarLabel={t('form.datePicker.open')}
          placeholder={t('form.datePlaceholder')}
          previousMonthLabel={t('form.datePicker.previous')}
          value={draft.holidayOn}
        />
      )}
    </HolidayField>
  )
}

/** Recorrência e o que ela pede: "todo ano" leva mês e dia; "só esta data" leva a data. */
export function HolidayWhenFields({
  controller,
  isDateFixed,
  isRecurrenceLocked,
}: HolidayWhenFieldsProps) {
  const { t } = useTranslation('businessCalendar')
  const { draft, issues } = controller

  return (
    <>
      <HolidayChoiceField
        ariaLabel={t('form.recurrenceAria')}
        disabled={isRecurrenceLocked}
        field="recurrence"
        issue={issues.recurrence}
        label={t('fields.recurrence')}
        onChange={controller.setRecurrence}
        options={HOLIDAY_RECURRENCES.map((value) => ({ label: t(`recurrences.${value}`), value }))}
        placeholder={t('form.recurrencePlaceholder')}
        value={draft.recurrence}
      />
      {draft.recurrence === HOLIDAY_RECURRENCE.YEARLY ? (
        <>
          <HolidayChoiceField
            ariaLabel={t('form.monthAria')}
            field="month"
            issue={issues.month}
            label={t('fields.month')}
            onChange={(value) => controller.setText('month', value)}
            options={monthOptions((month) => t(`months.${month}`))}
            placeholder={t('form.monthPlaceholder')}
            value={draft.month}
          />
          <HolidayTextField
            field="day"
            inputMode="numeric"
            issue={issues.day}
            label={t('form.dayAria')}
            onChange={(value) => controller.setText('day', value)}
            placeholder={t('form.dayPlaceholder')}
            value={draft.day}
          />
        </>
      ) : null}
      {draft.recurrence === HOLIDAY_RECURRENCE.ONCE ? (
        <HolidayDateField controller={controller} isDateFixed={isDateFixed} />
      ) : null}
    </>
  )
}
