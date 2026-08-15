/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import styles from '../styles/fleet.module.css'

type FleetFieldProps = Readonly<{
  hint?: string
  inputMode?: 'numeric' | 'text'
  label: string
  maxLength?: number
  onChange: (value: string) => void
  optional?: boolean
  value: string
}>

type FleetSelectFieldProps<TValue extends string> = Readonly<{
  clearable?: boolean
  label: string
  onChange: (value: TValue) => void
  optionLabelKey: string
  options: readonly TValue[]
  placeholder?: string
  value: TValue
}>

export function FleetField({
  hint,
  inputMode = 'text',
  label,
  maxLength = 120,
  onChange,
  optional = false,
  value,
}: FleetFieldProps) {
  const { t } = useTranslation('fleet')
  return (
    <label>
      <span>
        {label}
        {optional ? <em className={styles.optionalMark}>{t('optionalMark')}</em> : null}
      </span>
      <input
        inputMode={inputMode}
        maxLength={maxLength}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint === undefined ? null : <small className={styles.fieldHint}>{hint}</small>}
    </label>
  )
}

export function FleetSelectField<TValue extends string>({
  clearable = false,
  label,
  onChange,
  optionLabelKey,
  options,
  placeholder,
  value,
}: FleetSelectFieldProps<TValue>) {
  const { t } = useTranslation('fleet')
  return (
    <label>
      <span>{label}</span>
      <Select
        ariaLabel={label}
        clearable={clearable}
        options={options.map((option) => ({
          label: t(`${optionLabelKey}.${option}`),
          value: option,
        }))}
        {...(placeholder === undefined ? {} : { placeholder })}
        value={value}
        onChange={(next) => onChange(next as TValue)}
      />
    </label>
  )
}
