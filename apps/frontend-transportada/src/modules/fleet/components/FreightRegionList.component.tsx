/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'

import type { FreightRegionColumnKey } from '../shared/freightRegionColumns.service'
import { readFreightRegionColumnValue } from '../shared/freightRegionColumns.service'
import type { FreightRegionSortColumn } from '../shared/freightRegionTable.service'
import type { FreightRegionTableController } from '../hooks/useFreightRegionTable.hook'
import styles from '../styles/fleet.module.css'

const SORT_INDICATOR = { ascending: '▲', descending: '▼', none: '' } as const

type FreightRegionListProps = Readonly<{
  columns: readonly FreightRegionColumnKey[]
  table: FreightRegionTableController
}>

export function FreightRegionList({ columns, table }: FreightRegionListProps) {
  const { t } = useTranslation('fleet')

  function sortState(column: FreightRegionSortColumn): 'ascending' | 'descending' | 'none' {
    if (table.sort === null || table.sort.column !== column) return 'none'
    return table.sort.direction === 'asc' ? 'ascending' : 'descending'
  }

  function sortLabel(column: FreightRegionSortColumn): string {
    if (table.sort === null || table.sort.column !== column) return t('sort.none')
    return table.sort.direction === 'asc' ? t('sort.asc') : t('sort.desc')
  }

  return (
    <div className={styles.tableScroll}>
      <table className={styles.fleetTable}>
        <thead>
          <tr>
            <th scope="col">
              <Checkbox
                ariaLabel={t('regionSelection.selectAll')}
                checked={table.selectionState === 'all'}
                indeterminate={table.selectionState === 'partial'}
                onChange={table.toggleAllVisible}
              />
            </th>
            {columns.map((column) => (
              <th aria-sort={sortState(column)} key={column} scope="col">
                <button
                  className={styles.sortButton}
                  onClick={() => table.toggleSort(column)}
                  type="button"
                >
                  {t(`regionColumns.${column}`)}
                  <span aria-hidden="true" className={styles.sortIndicator}>
                    {SORT_INDICATOR[sortState(column)]}
                  </span>
                  <span className={styles.srOnly}>{sortLabel(column)}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.regions.map((region) => (
            <tr aria-selected={table.isSelected(region.id)} key={region.id}>
              <td>
                <Checkbox
                  ariaLabel={t('regionSelection.select', { code: region.code })}
                  checked={table.isSelected(region.id)}
                  onChange={() => table.toggleRegion(region.id)}
                />
              </td>
              {columns.map((column) => (
                <td key={column}>
                  {readFreightRegionColumnValue({
                    column,
                    notInformedLabel: t('regions.notInformed'),
                    region,
                    statusLabel: t(`regionStatus.${region.status}`),
                  })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
