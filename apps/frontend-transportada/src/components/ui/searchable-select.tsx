/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useId, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

import { Icon } from '@/components/ui/icon'

import { SELECT_TRIGGER_CLASS_NAMES } from './select'
import {
  filterSearchableOptions,
  resolveSearchableSelectLabel,
  type ResolveCustomSearchableOption,
  type SearchableSelectOption,
} from './searchableSelect.service'
import { useFloatingLayer } from './useFloatingLayer.hook'

import listStyles from './select.module.css'
import styles from './searchable-select.module.css'

export type { SearchableSelectOption } from './searchableSelect.service'

type SearchableSelectProps = Readonly<{
  ariaLabel: string
  emptyLabel: string
  onChange: (value: string) => void
  options: readonly SearchableSelectOption[]
  placeholder: string
  searchPlaceholder: string
  value: string
  disabled?: boolean
  resolveCustomOption?: ResolveCustomSearchableOption
}>

function joinClassNames(...names: readonly (string | undefined | false)[]): string {
  return names
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .join(' ')
}

// Pickers que abrem um painel com busca, em vez de listbox puro, ainda vestem a pele do select.
export function SearchableSelect({
  ariaLabel,
  disabled = false,
  emptyLabel,
  onChange,
  options,
  placeholder,
  resolveCustomOption,
  searchPlaceholder,
  value,
}: SearchableSelectProps): JSX.Element {
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

  const selectedLabel = resolveSearchableSelectLabel({ options, value })
  const filtered = filterSearchableOptions({ options, query, resolveCustomOption })

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    searchInputRef.current?.focus()
  }, [isOpen])

  // Filtrar encurta a lista: um índice ativo herdado apontaria para fora dela e o Enter não escolheria nada.
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // A opção ativa tem de acompanhar o teclado dentro da lista rolável.
  useEffect(() => {
    if (!isOpen) return
    optionListRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, isOpen])

  function close(): void {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  function commit(index: number): void {
    const option = filtered[index]
    if (option === undefined) return
    onChange(option.value)
    close()
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, filtered.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      commit(activeIndex)
    }
  }

  const listId = `${baseId}-list`

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={joinClassNames(
          SELECT_TRIGGER_CLASS_NAMES.trigger,
          SELECT_TRIGGER_CLASS_NAMES.triggerCompact,
        )}
        disabled={disabled}
        onClick={() => (isOpen ? setIsOpen(false) : setIsOpen(true))}
        ref={triggerRef}
        type="button"
      >
        <span
          className={
            selectedLabel === undefined
              ? SELECT_TRIGGER_CLASS_NAMES.placeholder
              : SELECT_TRIGGER_CLASS_NAMES.value
          }
        >
          {selectedLabel ?? placeholder}
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
                  className={styles.optionList}
                  id={listId}
                  ref={optionListRef}
                  role="listbox"
                >
                  {filtered.map((option, index) => (
                    <li
                      aria-selected={option.value === value}
                      className={joinClassNames(
                        listStyles.option,
                        index === activeIndex && listStyles.optionActive,
                        option.value === value && listStyles.optionSelected,
                      )}
                      id={`${baseId}-${String(index)}`}
                      key={option.value}
                      onClick={() => commit(index)}
                      onMouseEnter={() => setActiveIndex(index)}
                      role="option"
                    >
                      {option.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
