/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useId, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

import { Checkbox } from '@/components/ui/checkbox'
import { FilterPills, type FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'

import {
  filterMultiSelectOptions,
  resolveMultiSelectSelection,
  toggleMultiSelectValue,
  type MultiSelectOption,
} from './multiSelect.service'
import { SELECT_TRIGGER_CLASS_NAMES } from './select'
import { resolveSelectSearchKey } from './select.service'
import { useFloatingLayer } from './useFloatingLayer.hook'

import listStyles from './select.module.css'
import styles from './multi-select.module.css'

export type { MultiSelectOption } from './multiSelect.service'

type MultiSelectProps = Readonly<{
  ariaLabel: string
  clearAllLabel: string
  emptyLabel: string
  onChange: (values: readonly string[]) => void
  options: readonly MultiSelectOption[]
  placeholder: string
  removeLabel: string
  searchPlaceholder: string
  /** O gatilho não cabe N rótulos: quem sabe pluralizar é o idioma de quem chama. */
  summaryLabel: (count: number) => string
  values: readonly string[]
  compact?: boolean
  disabled?: boolean
}>

const OPENING_KEYS = ['ArrowDown', 'ArrowUp', 'Enter', ' '] as const

function joinClassNames(...names: readonly (string | undefined | false)[]): string {
  return names
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .join(' ')
}

/**
 * Lista longa não cabe como grade de caixas: o painel guarda as opções e a tela cresce só com o
 * que foi escolhido. Selecionar não fecha o painel — escolher três veículos é um gesto só.
 */
export function MultiSelect({
  ariaLabel,
  clearAllLabel,
  compact = false,
  disabled = false,
  emptyLabel,
  onChange,
  options,
  placeholder,
  removeLabel,
  searchPlaceholder,
  summaryLabel,
  values,
}: MultiSelectProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionListRef = useRef<HTMLUListElement>(null)
  const baseId = useId()
  const {
    anchorRef: rootRef,
    layerRef: panelRef,
    layerStyle,
  } = useFloatingLayer<HTMLDivElement>({ isOpen, onDismiss: () => setIsOpen(false) })

  const selection = resolveMultiSelectSelection({ options, values })
  const filtered = filterMultiSelectOptions({ options, query })

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    searchInputRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!isOpen) return
    optionListRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, isOpen])

  function close(): void {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  function toggle(value: string): void {
    onChange(toggleMultiSelectValue({ value, values }))
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (isOpen || !OPENING_KEYS.includes(event.key as (typeof OPENING_KEYS)[number])) return
    event.preventDefault()
    setIsOpen(true)
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    event.stopPropagation()
    const action = resolveSelectSearchKey(event.key)
    if (action === 'type') return
    if (action === 'close') {
      close()
      return
    }
    event.preventDefault()
    if (action === 'move-down') {
      setActiveIndex((current) => Math.min(current + 1, filtered.length - 1))
      return
    }
    if (action === 'move-up') {
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }
    const option = filtered[activeIndex]
    if (option !== undefined) toggle(option.value)
  }

  const pills: readonly FilterPill[] = selection.map((option) => ({
    id: option.value,
    ...(option.icon === undefined ? {} : { icon: option.icon }),
    label: option.label,
    onRemove: () => toggle(option.value),
    removeLabel,
    value: option.description ?? '',
  }))

  const listId = `${baseId}-list`

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={joinClassNames(
          SELECT_TRIGGER_CLASS_NAMES.trigger,
          compact && SELECT_TRIGGER_CLASS_NAMES.triggerCompact,
        )}
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span
          className={
            selection.length === 0
              ? SELECT_TRIGGER_CLASS_NAMES.placeholder
              : SELECT_TRIGGER_CLASS_NAMES.value
          }
        >
          {selection.length === 0 ? placeholder : summaryLabel(selection.length)}
        </span>
        <Icon className={SELECT_TRIGGER_CLASS_NAMES.chevron ?? ''} name="chevron-down" />
      </button>
      {isOpen
        ? createPortal(
            <div className={styles.panel} ref={panelRef} style={layerStyle}>
              <div className={styles.searchField}>
                <Icon className={styles.searchIcon ?? ''} name="search" />
                <input
                  aria-activedescendant={
                    filtered.length === 0 ? undefined : `${baseId}-${String(activeIndex)}`
                  }
                  aria-controls={listId}
                  aria-expanded
                  aria-label={searchPlaceholder}
                  className={styles.searchInput}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={searchPlaceholder}
                  ref={searchInputRef}
                  role="combobox"
                  type="text"
                  value={query}
                />
              </div>
              {filtered.length === 0 ? (
                <p className={styles.empty}>{emptyLabel}</p>
              ) : (
                <ul
                  aria-label={ariaLabel}
                  aria-multiselectable
                  className={styles.optionList}
                  id={listId}
                  ref={optionListRef}
                  role="listbox"
                >
                  {filtered.map((option, index) => (
                    <li
                      aria-selected={values.includes(option.value)}
                      className={joinClassNames(
                        listStyles.option,
                        index === activeIndex && listStyles.optionActive,
                        values.includes(option.value) && listStyles.optionSelected,
                      )}
                      id={`${baseId}-${String(index)}`}
                      key={option.value}
                      onClick={() => toggle(option.value)}
                      onMouseEnter={() => setActiveIndex(index)}
                      role="option"
                    >
                      <span className={styles.control}>
                        <Checkbox
                          ariaLabel={option.label}
                          checked={values.includes(option.value)}
                          onChange={() => toggle(option.value)}
                        />
                      </span>
                      <span className={styles.optionText}>
                        <span>{option.label}</span>
                        {option.description === undefined ? null : (
                          <span className={styles.description}>{option.description}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>,
            document.body,
          )
        : null}
      <FilterPills clearAllLabel={clearAllLabel} onClearAll={() => onChange([])} pills={pills} />
    </div>
  )
}
