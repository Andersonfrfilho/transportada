/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { FormIssue } from '../shared/contractorFormIssue.types'
import styles from '../styles/contractorDirectory.module.css'

type ReceivingFormFieldProps = Readonly<{
  fieldName: string
  isDisabled: boolean
  issue: FormIssue | undefined
  label: string
  onChange: (value: string) => void
  value: string
  hint?: string
  inputMode?: 'decimal' | 'numeric' | 'text'
  isMultiline?: boolean
}>

/**
 * Rótulo, campo, ajuda e erro juntos. O erro é do próprio campo (`aria-invalid` + `aria-describedby`,
 * `web.md` §11) e o `data-field` é o endereço do atalho do aviso de recusa: o caminho que a API usou.
 */
export function ReceivingFormField({
  fieldName,
  hint,
  inputMode = 'text',
  isDisabled,
  isMultiline = false,
  issue,
  label,
  onChange,
  value,
}: ReceivingFormFieldProps): JSX.Element {
  const { t } = useTranslation('contractorDirectory')
  const baseId = useId()
  const hintId = `${baseId}-hint`
  const errorId = `${baseId}-error`
  const describedBy = [hint === undefined ? '' : hintId, issue === undefined ? '' : errorId]
    .filter((id) => id !== '')
    .join(' ')
  const sharedProps = {
    'aria-describedby': describedBy === '' ? undefined : describedBy,
    'aria-invalid': issue === undefined ? undefined : true,
    'data-field': fieldName,
    disabled: isDisabled,
    value,
  } as const

  return (
    <div className={styles.fieldGroup}>
      <label className={styles.field}>
        {label}
        {isMultiline ? (
          <textarea {...sharedProps} onChange={(event) => onChange(event.target.value)} rows={3} />
        ) : (
          <input
            {...sharedProps}
            inputMode={inputMode}
            onChange={(event) => onChange(event.target.value)}
            type="text"
          />
        )}
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
