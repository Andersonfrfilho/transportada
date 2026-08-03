/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, type JSX, type ReactNode } from 'react'

import styles from './checkbox.module.css'

type CheckboxProps = Readonly<{
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel?: string
  disabled?: boolean
  indeterminate?: boolean
  label?: ReactNode
}>

export function Checkbox({
  ariaLabel,
  checked,
  disabled = false,
  indeterminate = false,
  label,
  onChange,
}: CheckboxProps): JSX.Element {
  const inputReference = useRef<HTMLInputElement>(null)

  // `indeterminate` só existe como propriedade do DOM: não há atributo equivalente em JSX.
  useEffect(() => {
    const input = inputReference.current
    if (input !== null) input.indeterminate = indeterminate && !checked
  }, [checked, indeterminate])

  const control = (
    <>
      <input
        aria-label={ariaLabel}
        checked={checked}
        className={styles.input}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        ref={inputReference}
        type="checkbox"
      />
      <span aria-hidden="true" className={styles.box}>
        <svg className={styles.mark} viewBox="0 0 16 16">
          <path className={styles.check} d="M3.6 8.4l2.9 2.9 5.9-6.2" />
          <path className={styles.dash} d="M4.2 8h7.6" />
        </svg>
      </span>
    </>
  )

  // Sem texto próprio o gatilho vive dentro do rótulo de quem chama — dois <label> aninhados seriam inválidos.
  if (label === undefined) return <span className={styles.root}>{control}</span>

  return (
    <label className={styles.root}>
      {control}
      <span className={styles.label}>{label}</span>
    </label>
  )
}
