/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'

import styles from '../styles/cteProfiles.module.css'

type ProfileFieldProps = Readonly<{
  inputMode?: 'decimal' | 'numeric' | 'text'
  isWide?: boolean
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
  isWide = false,
  label,
  maxLength = 120,
  onChange,
  type = 'text',
  value,
}: ProfileFieldProps) {
  return (
    <label className={isWide ? styles.wideField : undefined}>
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
