/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'

import { cn } from '@/lib/utils'

import styles from '../styles/occurrenceValues.module.css'

type OccurrenceTextFieldProps = Readonly<{
  error?: string | undefined
  hint?: string | undefined
  inputMode: 'decimal' | 'text'
  label: string
  maxLength?: number | undefined
  onChange: (text: string) => void
  placeholder?: string | undefined
  value: string
}>

/**
 * Spec 247 (T5.3): o campo de texto das devoluções — quantidade, valor pago e número do documento.
 * O rótulo é ligado ao campo, a dica e o erro entram na descrição dele, e o alvo mede 44px.
 */
export function OccurrenceTextField({
  error,
  hint,
  inputMode,
  label,
  maxLength,
  onChange,
  placeholder,
  value,
}: OccurrenceTextFieldProps) {
  const inputId = useId()
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = [hint === undefined ? '' : hintId, error === undefined ? '' : errorId]
    .filter((id) => id !== '')
    .join(' ')

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={inputId}>
        {label}
      </label>
      <input
        aria-describedby={describedBy === '' ? undefined : describedBy}
        aria-invalid={error === undefined ? undefined : true}
        autoComplete="off"
        className={cn(styles.input, error === undefined ? '' : styles.inputInvalid)}
        id={inputId}
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      {hint === undefined ? null : (
        <p className={styles.fieldHint} id={hintId}>
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p className={styles.fieldError} id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}
