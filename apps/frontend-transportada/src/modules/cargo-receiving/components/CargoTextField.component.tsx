/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoFormIssue } from '../shared/cargoArrivalForm.validation'
import styles from '../styles/cargoReceiving.module.css'

type CargoTextFieldProps = Readonly<{
  fieldName: string
  isDisabled?: boolean
  issue: CargoFormIssue | undefined
  label: string
  onChange: (value: string) => void
  value: string
  hint?: string
  inputMode?: 'decimal' | 'numeric' | 'text'
  placeholder?: string
}>

/**
 * Rótulo, campo, ajuda e erro juntos. O erro é do próprio campo (`aria-invalid` + `aria-describedby`,
 * `web.md` §11) e o `data-field` é o endereço do atalho do aviso de recusa: o nome que a API usou.
 */
export function CargoTextField({
  fieldName,
  hint,
  inputMode = 'text',
  isDisabled = false,
  issue,
  label,
  onChange,
  placeholder,
  value,
}: CargoTextFieldProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const baseId = useId()
  const hintId = `${baseId}-hint`
  const errorId = `${baseId}-error`
  const describedBy = [hint === undefined ? '' : hintId, issue === undefined ? '' : errorId]
    .filter((id) => id !== '')
    .join(' ')

  return (
    <div className={styles.fieldGroup}>
      <label className={styles.field}>
        {label}
        <input
          aria-describedby={describedBy === '' ? undefined : describedBy}
          aria-invalid={issue === undefined ? undefined : true}
          data-field={fieldName}
          disabled={isDisabled}
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type="text"
          value={value}
        />
      </label>
      {hint === undefined ? null : (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      )}
      {issue === undefined ? null : (
        <p className={styles.error} id={errorId} role="alert">
          {t(`issues.${issue.code}`, { max: issue.max, min: issue.min })}
        </p>
      )}
    </div>
  )
}
