/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'

import styles from '../styles/userAdministration.module.css'

type CompanyUserTextFieldProps = Readonly<{
  label: string
  onChange: (value: string) => void
  value: string
  autoComplete?: string
  disabled?: boolean
  hint?: string
  isWide?: boolean
  maxLength?: number
  placeholder?: string
}>

type CompanyUserSelectFieldProps = Readonly<{
  label: string
  onChange: (value: string) => void
  optionLabelKey: string
  options: readonly string[]
  value: string
  disabled?: boolean
  hint?: string
}>

type CompanyUserRoleFieldProps = Readonly<{
  label: string
  onToggle: (role: string, checked: boolean) => void
  roles: readonly string[]
  selected: readonly string[]
  disabled?: boolean
  hint?: string
}>

export function CompanyUserTextField({
  autoComplete,
  disabled = false,
  hint,
  isWide = false,
  label,
  maxLength = 120,
  onChange,
  placeholder,
  value,
}: CompanyUserTextFieldProps) {
  const className = isWide ? `${styles.field ?? ''} ${styles.wideField ?? ''}` : styles.field

  return (
    <label className={className}>
      <span>{label}</span>
      <input
        autoComplete={autoComplete}
        disabled={disabled}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      {hint === undefined ? null : <span className={styles.fieldHint}>{hint}</span>}
    </label>
  )
}

export function CompanyUserSelectField({
  disabled = false,
  hint,
  label,
  onChange,
  optionLabelKey,
  options,
  value,
}: CompanyUserSelectFieldProps) {
  const { t } = useTranslation('identity')

  return (
    <label className={styles.field}>
      <span>{label}</span>
      <Select
        ariaLabel={label}
        disabled={disabled}
        onChange={onChange}
        options={options.map((option) => ({
          label: t(`${optionLabelKey}.${option}`, { defaultValue: option }),
          value: option,
        }))}
        value={value}
      />
      {hint === undefined ? null : <span className={styles.fieldHint}>{hint}</span>}
    </label>
  )
}

export function CompanyUserRoleField({
  disabled = false,
  hint,
  label,
  onToggle,
  roles,
  selected,
}: CompanyUserRoleFieldProps) {
  const { t } = useTranslation('identity')

  return (
    <fieldset className={styles.roleGroup}>
      <legend>{label}</legend>
      <div className={styles.roleOptions}>
        {roles.map((role) => (
          <Checkbox
            checked={selected.includes(role)}
            disabled={disabled}
            key={role}
            label={t(`users.role.${role}`, { defaultValue: role })}
            onChange={(checked) => onToggle(role, checked)}
          />
        ))}
      </div>
      {hint === undefined ? null : <span className={styles.fieldHint}>{hint}</span>}
    </fieldset>
  )
}
