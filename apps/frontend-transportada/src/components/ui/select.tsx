/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useId, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

import { Icon } from '@/components/ui/icon'

import { useFloatingLayer } from './useFloatingLayer.hook'

import styles from './select.module.css'

export type SelectOption = Readonly<{ label: string; value: string }>

type SelectProps = Readonly<{
  onChange: (value: string) => void
  options: readonly SelectOption[]
  value: string
  align?: 'end'
  ariaLabel?: string
  clearable?: boolean
  compact?: boolean
  disabled?: boolean
  placeholder?: string
}>

const OPENING_KEYS = ['ArrowDown', 'ArrowUp', 'Enter', ' '] as const

// Pickers that open a panel instead of a listbox still have to wear the select skin.
export const SELECT_TRIGGER_CLASS_NAMES = {
  chevron: styles.chevron,
  placeholder: styles.placeholder,
  trigger: styles.trigger,
  triggerCompact: styles.triggerCompact,
  value: styles.value,
} as const

function joinClassNames(...names: readonly (string | undefined | false)[]): string {
  return names
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .join(' ')
}

export function Select({
  align,
  ariaLabel,
  clearable = false,
  compact = false,
  disabled = false,
  onChange,
  options,
  placeholder = '',
  value,
}: SelectProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const triggerReference = useRef<HTMLButtonElement>(null)
  const baseId = useId()
  const {
    anchorRef: rootReference,
    layerRef: listReference,
    layerStyle,
  } = useFloatingLayer<HTMLUListElement>({
    ...(align === undefined ? {} : { align }),
    isOpen,
    onDismiss: () => setIsOpen(false),
  })

  const entries: readonly SelectOption[] = clearable
    ? [{ label: placeholder, value: '' }, ...options]
    : options
  const selectedIndex = entries.findIndex((entry) => entry.value === value)
  const selected = selectedIndex < 0 ? undefined : entries[selectedIndex]

  // The active option has to follow the keyboard inside the scrolling list.
  useEffect(() => {
    if (!isOpen) return
    listReference.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, isOpen, listReference])

  function open(): void {
    if (disabled) return
    setActiveIndex(selectedIndex < 0 ? 0 : selectedIndex)
    setIsOpen(true)
  }

  function close(): void {
    setIsOpen(false)
    triggerReference.current?.focus()
  }

  function commit(index: number): void {
    const entry = entries[index]
    if (entry === undefined) return
    onChange(entry.value)
    close()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!isOpen) {
      if (!OPENING_KEYS.some((key) => key === event.key)) return
      event.preventDefault()
      open()
      return
    }
    if (event.key === 'Escape' || event.key === 'Tab') {
      // Dentro de um modal o Escape fecharia a lista e o diálogo de uma vez.
      if (event.key === 'Escape') event.stopPropagation()
      close()
      return
    }
    const moves: Record<string, number | undefined> = {
      ArrowDown: Math.min(activeIndex + 1, entries.length - 1),
      ArrowUp: Math.max(activeIndex - 1, 0),
      End: entries.length - 1,
      Home: 0,
    }
    const next = moves[event.key]
    if (next !== undefined) {
      event.preventDefault()
      setActiveIndex(next)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      commit(activeIndex)
    }
  }

  return (
    <div
      className={joinClassNames(styles.root, compact && styles.rootCompact)}
      onKeyDown={handleKeyDown}
      ref={rootReference}
    >
      <button
        aria-activedescendant={isOpen ? `${baseId}-${String(activeIndex)}` : undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={joinClassNames(styles.trigger, compact && styles.triggerCompact)}
        disabled={disabled}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        ref={triggerReference}
        type="button"
      >
        <span className={selected === undefined ? styles.placeholder : styles.value}>
          {selected?.label ?? placeholder}
        </span>
        <Icon
          className={joinClassNames(styles.chevron, isOpen && styles.chevronOpen)}
          name="chevron-down"
        />
      </button>
      {isOpen
        ? createPortal(
            <ul
              aria-label={ariaLabel}
              className={styles.list}
              ref={listReference}
              role="listbox"
              style={layerStyle}
            >
              {entries.map((entry, index) => (
                <li
                  aria-selected={entry.value === value}
                  className={joinClassNames(
                    styles.option,
                    index === activeIndex && styles.optionActive,
                    entry.value === value && styles.optionSelected,
                  )}
                  id={`${baseId}-${String(index)}`}
                  key={entry.value}
                  onClick={() => commit(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                >
                  {entry.label}
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
