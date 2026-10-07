/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoSort } from '../shared/cargoTableSort.service'
import tableStyles from '../styles/cargoTable.module.css'

const SORT_INDICATOR = { ascending: '▲', descending: '▼', none: '' } as const

type CargoSortHeaderProps<TColumn extends string> = Readonly<{
  column: TColumn
  label: string
  onToggle: (column: TColumn) => void
  sort: CargoSort<TColumn> | null
}>

/** Cabeçalho clicável asc → desc → neutro, com a direção ativa dita em texto e no `aria-sort`. */
export function CargoSortHeader<TColumn extends string>({
  column,
  label,
  onToggle,
  sort,
}: CargoSortHeaderProps<TColumn>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const sortState =
    sort?.column !== column ? 'none' : sort.direction === 'asc' ? 'ascending' : 'descending'
  const sortLabel = {
    ascending: t('table.sortAscending'),
    descending: t('table.sortDescending'),
    none: t('table.sortNone'),
  }[sortState]

  return (
    <th aria-sort={sortState} scope="col">
      <button className={tableStyles.sortButton} onClick={() => onToggle(column)} type="button">
        {label}
        <span aria-hidden="true" className={tableStyles.sortIndicator}>
          {SORT_INDICATOR[sortState]}
        </span>
        <span className={tableStyles.srOnly}>{sortLabel}</span>
      </button>
    </th>
  )
}
