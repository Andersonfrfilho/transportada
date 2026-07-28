/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import styles from '../styles/cteProfiles.module.css'

type ProfileFieldProps = Readonly<{
  inputMode?: 'decimal' | 'numeric' | 'text'
  label: string
  maxLength?: number
  onChange: (value: string) => void
  type?: 'date' | 'text'
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
  label,
  maxLength = 120,
  onChange,
  type = 'text',
  value,
}: ProfileFieldProps) {
  return (
    <label>
      <span>{label}</span>
      <input
        inputMode={inputMode}
        maxLength={maxLength}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
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
      <select value={value} onChange={(event) => onChange(event.target.value as TValue)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {t(`${optionLabelKey}.${option}`)}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ProfileCheckboxField({ checked, label, onChange }: ProfileCheckboxFieldProps) {
  return (
    <label className={styles.checkboxField}>
      <input
        checked={checked}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}
