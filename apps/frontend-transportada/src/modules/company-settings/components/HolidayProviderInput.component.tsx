/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'

import type { HolidayProviderField } from '../shared/holidayProviderSettingsForm.service'
import styles from '../styles/businessCalendar.module.css'
import providerStyles from '../styles/holidayProviderSettings.module.css'

type HolidayProviderInputControl = Readonly<{
  autoComplete: 'off'
  inputMode?: 'numeric' | 'text'
  onChange: (value: string) => void
  placeholder?: string
  spellCheck?: boolean
  type: 'password' | 'text'
  value: string
}>

type HolidayProviderInputProps = Readonly<{
  control: HolidayProviderInputControl
  field: HolidayProviderField
  hint: string
  /** O texto do erro do campo; `undefined` quando o campo está certo. */
  issueText: string | undefined
  label: string
}>

/**
 * Um campo do formulário da chave: rótulo visível ligado ao controle (`for`/`id`), a dica e o erro descritos por
 * `aria-describedby`, e o `data-field` com o nome que a API usa — é por ele que o aviso de recusa devolve o foco.
 */
export function HolidayProviderInput({
  control,
  field,
  hint,
  issueText,
  label,
}: HolidayProviderInputProps) {
  const base = useId()
  const inputId = `${base}-input`
  const hintId = `${base}-hint`
  const errorId = `${base}-error`
  const hasIssue = issueText !== undefined

  return (
    <div className={styles.field} data-field={field}>
      <label className={styles.fieldLabel} htmlFor={inputId}>
        {label}
      </label>
      <input
        aria-describedby={hasIssue ? `${hintId} ${errorId}` : hintId}
        autoComplete={control.autoComplete}
        className={styles.input}
        id={inputId}
        onChange={(event) => control.onChange(event.target.value)}
        type={control.type}
        value={control.value}
        {...(hasIssue ? { 'aria-invalid': true } : {})}
        {...(control.inputMode === undefined ? {} : { inputMode: control.inputMode })}
        {...(control.placeholder === undefined ? {} : { placeholder: control.placeholder })}
        {...(control.spellCheck === undefined ? {} : { spellCheck: control.spellCheck })}
      />
      <p className={providerStyles.fieldHint} id={hintId}>
        {hint}
      </p>
      {hasIssue ? (
        <p className={styles.fieldError} data-field-error="" id={errorId}>
          {issueText}
        </p>
      ) : null}
    </div>
  )
}
