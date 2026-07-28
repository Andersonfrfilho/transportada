/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useId, useRef, useState, type JSX } from 'react'

import styles from '../styles/nfeWorkspace.module.css'

export type SelectMenuOption = Readonly<{ label: string; value: string }>

type SelectMenuProps = Readonly<{
  ariaLabel: string
  onChange: (value: string) => void
  options: readonly SelectMenuOption[]
  placeholder: string
  value: string
  align?: 'end'
  clearable?: boolean
  compact?: boolean
}>

function className(...names: readonly (string | undefined)[]): string {
  return names.filter((name) => name !== undefined && name.length > 0).join(' ')
}

export function SelectMenu({
  align,
  ariaLabel,
  clearable = true,
  compact,
  onChange,
  options,
  placeholder,
  value,
}: SelectMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return undefined
    function handlePointer(event: MouseEvent): void {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointer)
    return () => document.removeEventListener('mousedown', handlePointer)
  }, [open])

  const selected = options.find((option) => option.value === value)

  function handleSelect(next: string): void {
    onChange(next)
    setOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') setOpen(false)
  }

  return (
    <div
      className={className(
        styles.selectMenu,
        compact === true ? styles.selectMenuCompact : undefined,
      )}
      onKeyDown={handleKeyDown}
      ref={rootRef}
    >
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={styles.selectTrigger}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className={selected === undefined ? styles.selectPlaceholder : styles.selectValue}>
          {selected?.label ?? placeholder}
        </span>
        <svg aria-hidden="true" className={styles.selectChevron} viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <ul
          aria-label={ariaLabel}
          className={className(
            styles.selectList,
            align === 'end' ? styles.selectListEnd : undefined,
          )}
          id={listId}
          role="listbox"
        >
          {clearable ? (
            <li
              aria-selected={value === ''}
              className={className(
                styles.selectOption,
                value === '' ? styles.selectOptionActive : undefined,
              )}
              onClick={() => handleSelect('')}
              role="option"
            >
              {placeholder}
            </li>
          ) : null}
          {options.map((option) => (
            <li
              aria-selected={option.value === value}
              className={className(
                styles.selectOption,
                option.value === value ? styles.selectOptionActive : undefined,
              )}
              key={option.value}
              onClick={() => handleSelect(option.value)}
              role="option"
            >
              {option.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
