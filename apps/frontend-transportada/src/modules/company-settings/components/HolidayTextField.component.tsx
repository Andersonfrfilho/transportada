/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useHolidayFieldIds } from '../hooks/useHolidayFieldIds.hook'
import { DAY_INPUT_MAX_LENGTH, HOLIDAY_NAME_MAX_LENGTH } from '../shared/businessCalendar.constant'
import type {
  HolidayField as HolidayFieldName,
  HolidayIssue,
} from '../shared/businessCalendarForm.validation'
import styles from '../styles/businessCalendar.module.css'

import { HolidayField } from './HolidayField.component'

const CITY_CODE_LENGTH = 7

const MAX_LENGTH: Readonly<Partial<Record<HolidayFieldName, number>>> = {
  cityIbgeCode: CITY_CODE_LENGTH,
  day: DAY_INPUT_MAX_LENGTH,
  name: HOLIDAY_NAME_MAX_LENGTH,
}

type HolidayTextFieldProps = Readonly<{
  disabled?: boolean
  field: HolidayFieldName
  inputMode?: 'numeric' | 'text'
  isWide?: boolean
  issue: HolidayIssue | undefined
  label: string
  onChange: (value: string) => void
  placeholder: string
  value: string
}>

/** Campo de texto do formulário: o nome (até 120) e o dia (dois dígitos, com máscara no hook). */
export function HolidayTextField({
  disabled = false,
  field,
  inputMode = 'text',
  isWide = false,
  issue,
  label,
  onChange,
  placeholder,
  value,
}: HolidayTextFieldProps) {
  const ids = useHolidayFieldIds()

  return (
    <HolidayField field={field} ids={ids} isWide={isWide} issue={issue} label={label}>
      <input
        {...(issue === undefined ? {} : { 'aria-describedby': ids.errorId, 'aria-invalid': true })}
        aria-label={label}
        className={styles.input}
        disabled={disabled}
        inputMode={inputMode}
        maxLength={MAX_LENGTH[field]}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </HolidayField>
  )
}
