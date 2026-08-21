/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Select } from '@/components/ui/select'

import styles from '../styles/cteProfiles.module.css'

type ProfileFieldProps = Readonly<{
  inputMode?: 'decimal' | 'numeric' | 'text'
  isWide?: boolean
  label: string
  maxLength?: number
  onChange: (value: string) => void
  value: string
}>

type ProfileDateFieldProps = Readonly<{
  isWide?: boolean
  label: string
  onChange: (value: string) => void
  value: string
}>

type ProfileSelectFieldProps<TValue extends string> = Readonly<{
  label: string
  onChange: (value: TValue) => void
  options: readonly TValue[]
  optionLabelKey: string
  value: TValue
}>

type ProfileCheckboxFieldProps = Readonly<{
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}>

export function ProfileField({
  inputMode = 'text',
  isWide = false,
  label,
  maxLength = 120,
  onChange,
  value,
}: ProfileFieldProps) {
  return (
    <label className={isWide ? styles.wideField : undefined}>
      <span>{label}</span>
      <input
        inputMode={inputMode}
        maxLength={maxLength}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

/**
 * Data é calendário, não campo de data nativo: o nativo muda de forma em cada navegador e
 * ignora os tokens do produto.
 */
export function ProfileDateField({
  isWide = false,
  label,
  onChange,
  value,
}: ProfileDateFieldProps) {
  const { t } = useTranslation('cteProfiles')
  return (
    <label className={isWide ? styles.wideField : undefined}>
      <span>{label}</span>
      <DatePicker
        ariaLabel={label}
        chooseYearLabel={t('dateField.chooseYear')}
        clearLabel={t('dateField.clear')}
        openCalendarLabel={t('dateField.openCalendar')}
        nextMonthLabel={t('dateField.nextMonth')}
        placeholder={t('dateField.placeholder')}
        previousMonthLabel={t('dateField.previousMonth')}
        value={value}
        onChange={onChange}
      />
    </label>
  )
}

export function ProfileSelectField<TValue extends string>({
  label,
  onChange,
  optionLabelKey,
  options,
  value,
}: ProfileSelectFieldProps<TValue>) {
  const { t } = useTranslation('cteProfiles')
  return (
    <label>
      <span>{label}</span>
      <Select
        ariaLabel={label}
        options={options.map((option) => ({
          label: t(`${optionLabelKey}.${option}`),
          value: option,
        }))}
        value={value}
        onChange={(next) => onChange(next as TValue)}
      />
    </label>
  )
}

export function ProfileCheckboxField({ checked, label, onChange }: ProfileCheckboxFieldProps) {
  return (
    <span className={styles.checkboxField}>
      <Checkbox checked={checked} label={label} onChange={onChange} />
    </span>
  )
}
