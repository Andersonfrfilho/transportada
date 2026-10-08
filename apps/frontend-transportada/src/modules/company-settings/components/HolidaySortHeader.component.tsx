/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { HolidaySort, HolidaySortColumn } from '../shared/businessCalendarTable.service'
import styles from '../styles/businessCalendar.module.css'

const SORT_INDICATOR = { ascending: '▲', descending: '▼', none: '' } as const

type HolidaySortHeaderProps = Readonly<{
  column: HolidaySortColumn
  label: string
  onToggle: (column: HolidaySortColumn) => void
  sort: HolidaySort | null
}>

/** Cabeçalho clicável asc → desc → neutro, com a direção ativa dita em texto e no `aria-sort`. */
export function HolidaySortHeader({ column, label, onToggle, sort }: HolidaySortHeaderProps) {
  const { t } = useTranslation('businessCalendar')
  const state =
    sort?.column !== column ? 'none' : sort.direction === 'asc' ? 'ascending' : 'descending'
  const spoken = {
    ascending: t('list.sortAscending'),
    descending: t('list.sortDescending'),
    none: t('list.sortNone'),
  }[state]

  return (
    <th aria-sort={state} scope="col">
      <button className={styles.sortButton} onClick={() => onToggle(column)} type="button">
        {label}
        <span aria-hidden="true" className={styles.sortIndicator}>
          {SORT_INDICATOR[state]}
        </span>
        <span className={styles.srOnly}>{spoken}</span>
      </button>
    </th>
  )
}
