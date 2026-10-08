/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { KeyboardEvent } from 'react'

import { RETURN_REQUIREMENT_LABEL_MAX_LENGTH } from '@/modules/trip/shared/occurrence.constant'
import styles from '@/modules/trip/styles/occurrenceTypeRequirement.module.css'

type OccurrenceTypeRecordLabelProps = Readonly<{
  disabled: boolean
  /** O texto da etiqueta, que também é o nome do campo para quem usa leitor de tela. */
  label: string
  onCommit: (value: string) => void
  value: string
}>

/** Spec 247 RF1: o rótulo que a tela de registro mostra. Grava ao sair; vazio ou igual ao gravado volta sem gravar. */
export function OccurrenceTypeRecordLabel({
  disabled,
  label,
  onCommit,
  value,
}: OccurrenceTypeRecordLabelProps) {
  function handleBlur(input: HTMLInputElement) {
    const next = input.value.trim()
    if (next === '' || next === value) {
      input.value = value
      return
    }
    onCommit(next)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur()
  }

  return (
    <label className={styles.recordText}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        aria-label={label}
        defaultValue={value}
        disabled={disabled}
        key={value}
        maxLength={RETURN_REQUIREMENT_LABEL_MAX_LENGTH}
        onBlur={(event) => handleBlur(event.currentTarget)}
        onKeyDown={handleKeyDown}
        type="text"
      />
    </label>
  )
}
