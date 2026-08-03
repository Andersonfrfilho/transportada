/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'

import { Icon } from '@/components/ui/icon'

import styles from './filter-pills.module.css'

export type FilterPill = Readonly<{
  id: string
  label: string
  onRemove: () => void
  removeLabel: string
  value: string
  editLabel?: string
  onEdit?: () => void
}>

type FilterPillsProps = Readonly<{
  clearAllLabel: string
  onClearAll: () => void
  pills: readonly FilterPill[]
}>

/** O design system não tem tradutor: todo texto visível entra por prop de quem chama. */
export function FilterPills({
  clearAllLabel,
  onClearAll,
  pills,
}: FilterPillsProps): JSX.Element | null {
  // Tira vazia não ocupa linha: sem filtro aplicado a tabela sobe.
  if (pills.length === 0) return null

  return (
    <div className={styles.root}>
      {pills.map((pill) => (
        <span
          className={pill.onEdit === undefined ? styles.pill : styles.pillEditable}
          key={pill.id}
        >
          <span className={styles.label}>{pill.label}</span>
          {pill.onEdit === undefined ? (
            <span className={styles.value}>{pill.value}</span>
          ) : (
            <button
              className={styles.edit}
              onClick={pill.onEdit}
              title={pill.editLabel}
              type="button"
            >
              {pill.value}
            </button>
          )}
          <button
            aria-label={pill.removeLabel}
            className={styles.remove}
            onClick={pill.onRemove}
            title={pill.removeLabel}
            type="button"
          >
            <Icon className={styles.icon ?? ''} name="close" size="sm" />
          </button>
        </span>
      ))}
      <button className={styles.clearAll} onClick={onClearAll} type="button">
        {clearAllLabel}
      </button>
    </div>
  )
}
