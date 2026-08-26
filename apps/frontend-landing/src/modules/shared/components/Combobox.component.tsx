/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import styles from './Combobox.module.css'

export type ComboboxOption = Readonly<{ label: string; value: string }>

type ComboboxProps = Readonly<{
  options: readonly ComboboxOption[]
  placeholder?: string
  required?: boolean
  value: string
  onChange: (value: string) => void
}>

/**
 * `<select>` nativo é proibido em lista a partir de ~8 opções (web.md §11) — o combo do SO não
 * busca e quebra o visual entre navegadores. Este componente é a versão mínima: input de texto que
 * filtra a lista à medida que digita, teclado (setas/Enter/Escape), fecha ao clicar fora.
 */
export function Combobox({
  options,
  placeholder,
  required,
  value,
  onChange,
}: ComboboxProps): ReactNode {
  const listId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const selectedLabel = options.find((option) => option.value === value)?.label ?? ''
  const displayValue = isOpen ? query : selectedLabel
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(query.toLowerCase()),
  )

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function openWithQuery(nextQuery: string): void {
    setQuery(nextQuery)
    setIsOpen(true)
    setHighlightedIndex(0)
  }

  function selectOption(option: ComboboxOption): void {
    onChange(option.value)
    setQuery('')
    setIsOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      setIsOpen(false)
      setQuery('')
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!isOpen) openWithQuery('')
      else setHighlightedIndex((current) => Math.min(current + 1, filteredOptions.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((current) => Math.max(current - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      const highlighted = filteredOptions[highlightedIndex]
      if (isOpen && highlighted !== undefined) {
        event.preventDefault()
        selectOption(highlighted)
      }
    }
  }

  return (
    <div ref={containerRef} className={styles.container}>
      <input
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={isOpen}
        autoComplete="off"
        className={styles.input}
        placeholder={placeholder}
        required={required && value === ''}
        role="combobox"
        value={displayValue}
        onChange={(event) => openWithQuery(event.target.value)}
        onFocus={() => openWithQuery('')}
        onKeyDown={handleKeyDown}
      />
      {isOpen ? (
        <ul className={styles.list} id={listId} role="listbox">
          {filteredOptions.length === 0 ? (
            <li className={styles.empty}>Nenhuma opção encontrada</li>
          ) : (
            filteredOptions.map((option, index) => (
              <li
                key={option.value}
                aria-selected={option.value === value}
                className={styles.option}
                data-highlighted={index === highlightedIndex}
                role="option"
                onMouseDown={(event) => {
                  event.preventDefault()
                  selectOption(option)
                }}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
