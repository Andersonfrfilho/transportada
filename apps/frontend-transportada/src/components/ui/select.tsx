/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'

import { Icon } from '@/components/ui/icon'

import {
  filterSelectOptions,
  resolveSelectSearchKey,
  shouldOfferSelectSearch,
  type SelectOption,
} from './select.service'
import { useFloatingLayer } from './useFloatingLayer.hook'

import styles from './select.module.css'

export type { SelectOption } from './select.service'

type SelectProps = Readonly<{
  onChange: (value: string) => void
  options: readonly SelectOption[]
  value: string
  align?: 'end'
  ariaLabel?: string
  clearable?: boolean
  compact?: boolean
  disabled?: boolean
  emptyLabel?: string
  placeholder?: string
  searchPlaceholder?: string
  triggerRef?: (element: HTMLButtonElement | null) => void
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

/** A cor entra por propriedade CSS: o painel é portal e nenhuma classe de módulo o alcança. */
function Swatch({ swatch }: Readonly<{ swatch: string }>): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={styles.swatch}
      style={{ '--select-swatch': swatch } as CSSProperties}
    />
  )
}

export function Select({
  align,
  ariaLabel,
  clearable = false,
  compact = false,
  disabled = false,
  emptyLabel,
  onChange,
  options,
  placeholder = '',
  searchPlaceholder,
  triggerRef,
  value,
}: SelectProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const triggerReference = useRef<HTMLButtonElement>(null)
  /** O chamador precisa do gatilho para dar foco a ele; a referência interna continua sendo a nossa. */
  const setTrigger = useCallback(
    (element: HTMLButtonElement | null) => {
      triggerReference.current = element
      triggerRef?.(element)
    },
    [triggerRef],
  )
  const listReference = useRef<HTMLUListElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const baseId = useId()
  const {
    anchorRef: rootReference,
    layerRef: panelReference,
    layerStyle,
  } = useFloatingLayer<HTMLDivElement>({
    ...(align === undefined ? {} : { align }),
    isOpen,
    onDismiss: () => setIsOpen(false),
  })

  const allEntries: readonly SelectOption[] = clearable
    ? [{ label: placeholder, value: '' }, ...options]
    : options
  const hasSearch = shouldOfferSelectSearch(allEntries.length)
  const entries = hasSearch ? filterSelectOptions({ options: allEntries, query }) : allEntries
  const selectedIndex = entries.findIndex((entry) => entry.value === value)
  const selected = allEntries.find((entry) => entry.value === value)

  // The active option has to follow the keyboard inside the scrolling list.
  useEffect(() => {
    if (!isOpen) return
    listReference.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, isOpen])

  // Filtrar encurta a lista: um índice herdado apontaria para fora dela e o Enter não escolheria nada.
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!isOpen || !hasSearch) return
    searchInputRef.current?.focus()
  }, [hasSearch, isOpen])

  function open(): void {
    if (disabled) return
    setQuery('')
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

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    // Portal do React propaga pela árvore de componentes, não pela do DOM: sem parar aqui, o
    // espaço digitado na busca chega ao onKeyDown da raiz e seleciona a opção ativa.
    event.stopPropagation()
    const action = resolveSelectSearchKey(event.key)
    if (action === 'type') return
    if (action === 'close') {
      close()
      return
    }
    event.preventDefault()
    if (action === 'move-down') {
      setActiveIndex((current) => Math.min(current + 1, entries.length - 1))
      return
    }
    if (action === 'move-up') {
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }
    commit(activeIndex)
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
        ref={setTrigger}
        type="button"
      >
        <span className={styles.selection}>
          {selected?.swatch === undefined ? null : <Swatch swatch={selected.swatch} />}
          <span className={selected === undefined ? styles.placeholder : styles.value}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <Icon
          className={joinClassNames(styles.chevron, isOpen && styles.chevronOpen)}
          name="chevron-down"
        />
      </button>
      {isOpen
        ? createPortal(
            <div className={styles.panel} ref={panelReference} style={layerStyle}>
              {hasSearch ? (
                <div className={styles.searchField}>
                  <Icon className={styles.searchIcon ?? ''} name="search" />
                  <input
                    aria-activedescendant={
                      entries.length === 0 ? undefined : `${baseId}-${String(activeIndex)}`
                    }
                    aria-controls={`${baseId}-list`}
                    aria-expanded
                    aria-label={searchPlaceholder ?? ariaLabel}
                    className={styles.searchInput}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder={searchPlaceholder ?? ''}
                    ref={searchInputRef}
                    role="combobox"
                    type="text"
                    value={query}
                  />
                </div>
              ) : null}
              {entries.length === 0 && emptyLabel !== undefined ? (
                <p className={styles.empty}>{emptyLabel}</p>
              ) : (
                <ul
                  aria-label={ariaLabel}
                  className={styles.list}
                  id={`${baseId}-list`}
                  ref={listReference}
                  role="listbox"
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
                      {entry.swatch === undefined ? null : <Swatch swatch={entry.swatch} />}
                      {entry.label}
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
