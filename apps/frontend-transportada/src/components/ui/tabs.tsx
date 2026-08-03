/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useRef, type JSX, type KeyboardEvent, type ReactNode } from 'react'

import styles from './tabs.module.css'

export type TabsItem = Readonly<{
  id: string
  label: string
  panel: ReactNode
  badge?: string
}>

type TabsProps = Readonly<{
  ariaLabel: string
  items: readonly TabsItem[]
  onChange: (id: string) => void
  value: string
}>

export function Tabs({ ariaLabel, items, onChange, value }: TabsProps): JSX.Element {
  const baseId = useId()
  const listReference = useRef<HTMLDivElement>(null)

  const activeIndex = Math.max(
    items.findIndex((item) => item.id === value),
    0,
  )
  const activeItem = items[activeIndex]

  function tabId(index: number): string {
    return `${baseId}-tab-${String(index)}`
  }

  function panelId(index: number): string {
    return `${baseId}-panel-${String(index)}`
  }

  // Setas movem foco e seleção juntos — ativação automática é o padrão de tablist horizontal.
  function activate(index: number): void {
    const item = items[index]
    if (item === undefined) return
    onChange(item.id)
    const tab = listReference.current?.children[index]
    if (tab instanceof HTMLElement) tab.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const moves: Record<string, number | undefined> = {
      ArrowLeft: (activeIndex - 1 + items.length) % items.length,
      ArrowRight: (activeIndex + 1) % items.length,
      End: items.length - 1,
      Home: 0,
    }
    const next = moves[event.key]
    if (next === undefined) return
    event.preventDefault()
    activate(next)
  }

  return (
    <div className={styles.root}>
      <div
        aria-label={ariaLabel}
        className={styles.list}
        onKeyDown={handleKeyDown}
        ref={listReference}
        role="tablist"
      >
        {items.map((item, index) => (
          <button
            aria-controls={panelId(index)}
            aria-selected={index === activeIndex}
            className={index === activeIndex ? styles.tabActive : styles.tab}
            id={tabId(index)}
            key={item.id}
            onClick={() => onChange(item.id)}
            role="tab"
            tabIndex={index === activeIndex ? 0 : -1}
            type="button"
          >
            {item.label}
            {item.badge === undefined ? null : <span className={styles.badge}>{item.badge}</span>}
          </button>
        ))}
      </div>
      {activeItem === undefined ? null : (
        <div
          aria-labelledby={tabId(activeIndex)}
          className={styles.panel}
          id={panelId(activeIndex)}
          role="tabpanel"
          tabIndex={0}
        >
          {activeItem.panel}
        </div>
      )}
    </div>
  )
}
