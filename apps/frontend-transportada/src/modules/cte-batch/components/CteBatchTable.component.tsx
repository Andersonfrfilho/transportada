/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { CountBadge } from '@/components/ui/count-badge'
import { FilterPills, type FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'
import { formatCalendarDate } from '@/modules/shared/calendarDate.service'
import { SELECTION_SEPARATOR } from '@/modules/shared/filterPill.service'

import type { CteBatchSubmissionController } from '../hooks/useCteBatchSubmission.hook'
import type { CteBatchTableController } from '../hooks/useCteBatchTable.hook'
import type { CteBatchStatus, CteBatchSummary } from '../shared/cteBatchClient.service'
import {
  describeCteBatchFilterPills,
  type CteBatchFilterPill,
} from '../shared/cteBatchFilterPills.service'
import type { CteBatchColumnKey } from '../shared/cteBatchTable.service'
import styles from '../styles/cteBatch.module.css'
import { CteBatchColumnsMenu } from './CteBatchColumnsMenu.component'
import { CteBatchFilters } from './CteBatchFilters.component'
import { CteBatchRowActions } from './CteBatchRowActions.component'
import { CteBatchSelectionBar } from './CteBatchSelectionBar.component'

const READY_STATUSES: readonly CteBatchStatus[] = ['done', 'submitted']
const ALERT_STATUSES: readonly CteBatchStatus[] = ['cancelled', 'error']

export type CteBatchTableActions = Readonly<{
  onBill: (batches: readonly CteBatchSummary[]) => void
  onCancel: (batch: CteBatchSummary) => void
  onOpenItems: (batch: CteBatchSummary) => void
}>

type CteBatchTableProps = Readonly<{
  actions: CteBatchTableActions
  openBatchId?: string
  permissions: readonly string[]
  submission: CteBatchSubmissionController
  table: CteBatchTableController
}>

function statusClassName(status: CteBatchStatus): string {
  if (READY_STATUSES.includes(status)) return `${styles.statusBadge} ${styles.statusReady}`
  if (ALERT_STATUSES.includes(status)) return `${styles.statusBadge} ${styles.statusAlert}`
  return `${styles.statusBadge}`
}

function formatMoment(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : moment.toLocaleString()
}

export function CteBatchTable({
  actions,
  openBatchId,
  permissions,
  submission,
  table,
}: CteBatchTableProps) {
  const { t } = useTranslation('cteBatch')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false)

  // No modo avançado quem conta é o construtor de condições: as pílulas descrevem só o filtro simples.
  const descriptors =
    table.filterMode === 'advanced'
      ? []
      : describeCteBatchFilterPills({ filters: table.filters, formatDay: formatCalendarDate })
  const pills: readonly FilterPill[] = descriptors.map(toPill)
  const activeCount = table.filterMode === 'advanced' ? table.activeFilterCount : pills.length

  function toPill(descriptor: CteBatchFilterPill): FilterPill {
    const label = t(descriptor.labelKey)
    const value =
      descriptor.valueKeys === undefined
        ? descriptor.value
        : descriptor.valueKeys.map((key) => t(key)).join(SELECTION_SEPARATOR)
    return {
      id: descriptor.field,
      label,
      onRemove: () => table.clearFilterField(descriptor.field),
      removeLabel: t('filters.removeFilter', { field: label }),
      value,
    }
  }

  function renderCell(batch: CteBatchSummary, column: CteBatchColumnKey) {
    if (column === 'status') {
      return <span className={statusClassName(batch.status)}>{t(`status.${batch.status}`)}</span>
    }
    if (column === 'createdAt') return formatMoment(batch.createdAt)
    if (column === 'updatedAt') return formatMoment(batch.updatedAt)
    if (column === 'itemCount') return batch.itemCount
    if (column === 'version') return batch.version
    return batch.name
  }

  function sortState(column: CteBatchColumnKey): 'ascending' | 'descending' | 'none' {
    if (table.sort === null || table.sort.column !== column) return 'none'
    return table.sort.direction === 'asc' ? 'ascending' : 'descending'
  }

  function sortIndicator(column: CteBatchColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return ''
    return table.sort.direction === 'asc' ? '▲' : '▼'
  }

  function sortLabel(column: CteBatchColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return t('sort.none')
    return table.sort.direction === 'asc' ? t('sort.asc') : t('sort.desc')
  }

  return (
    <section className={styles.panel} aria-labelledby="cte-batch-table-title">
      <div className={styles.panelHead}>
        <h2 id="cte-batch-table-title">{t('batchesTitle')}</h2>
        <div className={styles.tableToolbar}>
          <p className={styles.counter}>
            {t('resultCounter', { shown: table.visibleBatches.length, total: table.totalCount })}
          </p>
          <button
            aria-expanded={isFilterOpen}
            aria-label={t('filters.title')}
            className={isFilterOpen ? styles.iconActionActive : styles.iconAction}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            title={t('filters.title')}
            type="button"
          >
            <Icon name="filter" />
            <CountBadge count={activeCount} />
          </button>
          <span className={styles.columnsMenuWrap}>
            <button
              aria-expanded={isColumnsMenuOpen}
              aria-label={t('columns.title')}
              className={isColumnsMenuOpen ? styles.iconActionActive : styles.iconAction}
              onClick={() => setIsColumnsMenuOpen(!isColumnsMenuOpen)}
              title={t('columns.title')}
              type="button"
            >
              <Icon name="columns" />
            </button>
            {isColumnsMenuOpen ? <CteBatchColumnsMenu table={table} /> : null}
          </span>
          {activeCount > 0 || table.sort !== null ? (
            <button
              aria-label={t('filters.clear')}
              className={styles.iconAction}
              onClick={table.clearFilters}
              title={t('filters.clear')}
              type="button"
            >
              <Icon name="filter-clear" />
            </button>
          ) : null}
        </div>
      </div>

      {isFilterOpen ? <CteBatchFilters table={table} /> : null}

      <FilterPills
        clearAllLabel={t('filters.clear')}
        onClearAll={table.clearFilters}
        pills={pills}
      />

      <CteBatchSelectionBar
        onBill={actions.onBill}
        onCancel={actions.onCancel}
        permissions={permissions}
        submission={submission}
        table={table}
      />

      <div className={styles.tableScroll}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th scope="col">
                <Checkbox
                  ariaLabel={t('selection.selectAll')}
                  checked={
                    table.visibleBatches.length > 0 &&
                    table.selectedBatches.length === table.visibleBatches.length
                  }
                  indeterminate={
                    table.selectedBatches.length > 0 &&
                    table.selectedBatches.length < table.visibleBatches.length
                  }
                  onChange={() => table.toggleAllSelection()}
                />
              </th>
              {table.visibleColumns.map((column) => (
                <th aria-sort={sortState(column)} key={column} scope="col">
                  <button
                    className={styles.sortButton}
                    onClick={() => table.toggleSort(column)}
                    type="button"
                  >
                    {t(`columns.${column}`)}
                    <span className={styles.sortIndicator} aria-hidden="true">
                      {sortIndicator(column)}
                    </span>
                    <span className={styles.srOnly}>{sortLabel(column)}</span>
                  </button>
                </th>
              ))}
              <th scope="col">{t('items.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {table.visibleBatches.map((batch) => (
              <tr aria-selected={table.selectedIds.includes(batch.id)} key={batch.id}>
                <td>
                  <Checkbox
                    ariaLabel={`${t('selection.select')} ${batch.name}`}
                    checked={table.selectedIds.includes(batch.id)}
                    onChange={() => table.toggleSelection(batch.id)}
                  />
                </td>
                {table.visibleColumns.map((column) => (
                  <td key={column}>{renderCell(batch, column)}</td>
                ))}
                <td>
                  <CteBatchRowActions
                    batch={batch}
                    isOpen={openBatchId === batch.id}
                    onBill={actions.onBill}
                    onCancel={actions.onCancel}
                    onOpenItems={actions.onOpenItems}
                    permissions={permissions}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.visibleBatches.length === 0 ? <p className={styles.hint}>{t('empty')}</p> : null}
    </section>
  )
}
