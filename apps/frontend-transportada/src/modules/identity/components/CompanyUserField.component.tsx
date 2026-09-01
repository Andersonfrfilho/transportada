/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { RefObject } from 'react'
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
  errorText?: string
  hint?: string
  inputRef?: RefObject<HTMLInputElement | null>
  isWide?: boolean
  maxLength?: number
  placeholder?: string
}>

type CompanyUserMaskedFieldProps = Readonly<{
  format: (value: string) => string
  label: string
  onChange: (value: string) => void
  value: string
  disabled?: boolean
  errorText?: string
  hint?: string
  inputMode?: 'numeric' | 'tel'
  inputRef?: RefObject<HTMLInputElement | null>
  maxLength?: number
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
  groupRef?: RefObject<HTMLFieldSetElement | null>
  onToggle: (role: string, checked: boolean) => void
  roles: readonly string[]
  selected: readonly string[]
  disabled?: boolean
  hint?: string
}>

export function CompanyUserTextField({
  autoComplete,
  disabled = false,
  errorText,
  hint,
  inputRef,
  isWide = false,
  label,
  maxLength = 120,
  onChange,
  placeholder,
  value,
}: CompanyUserTextFieldProps) {
  const className = isWide ? `${styles.field ?? ''} ${styles.wideField ?? ''}` : styles.field
  const messageId = `${label}-message`

  return (
    <label className={className}>
      <span>{label}</span>
      <input
        aria-describedby={errorText === undefined ? undefined : messageId}
        aria-invalid={errorText === undefined ? undefined : true}
        autoComplete={autoComplete}
        disabled={disabled}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        ref={inputRef}
        type="text"
        value={value}
      />
      {errorText === undefined ? null : (
        <span className={styles.fieldError} id={messageId} role="alert">
          {errorText}
        </span>
      )}
      {errorText !== undefined || hint === undefined ? null : (
        <span className={styles.fieldHint}>{hint}</span>
      )}
    </label>
  )
}

/**
 * Formata enquanto se digita, e o estado guarda o texto formatado: reformatar a cada tecla a
 * partir do valor cru moveria o cursor para o fim toda vez que a máscara inserisse pontuação.
 */
export function CompanyUserMaskedField({
  disabled = false,
  errorText,
  format,
  hint,
  inputMode,
  inputRef,
  label,
  maxLength,
  onChange,
  value,
}: CompanyUserMaskedFieldProps) {
  const hintId = `${label}-hint`

  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        aria-describedby={errorText === undefined ? undefined : hintId}
        aria-invalid={errorText === undefined ? undefined : true}
        disabled={disabled}
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={(event) => onChange(format(event.target.value))}
        ref={inputRef}
        type="text"
        value={value}
      />
      {errorText === undefined ? null : (
        <span className={styles.fieldError} id={hintId} role="alert">
          {errorText}
        </span>
      )}
      {errorText !== undefined || hint === undefined ? null : (
        <span className={styles.fieldHint}>{hint}</span>
      )}
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
  groupRef,
  hint,
  label,
  onToggle,
  roles,
  selected,
}: CompanyUserRoleFieldProps) {
  const { t } = useTranslation('identity')

  return (
    <fieldset className={styles.roleGroup} ref={groupRef} tabIndex={-1}>
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
