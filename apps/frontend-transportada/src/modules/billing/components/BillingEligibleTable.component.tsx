/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { FilterPills, type FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatCalendarDate } from '@/modules/shared/calendarDate.service'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import type { BillingEligibleTableController } from '../hooks/useBillingEligibleTable.hook'
import type { BillingEligibleCte } from '../shared/billingClient.service'
import {
  describeBillingEligibleFilterPills,
  type BillingEligibleFilterPill,
} from '../shared/billingEligibleFilterPills.service'
import type { BillingEligibleColumnKey } from '../shared/billingEligibleTable.service'
import styles from '../styles/billingEligibleTable.module.css'
import { BillingEligibleFilters } from './BillingEligibleFilters.component'

type BillingEligibleTableProps = Readonly<{
  table: BillingEligibleTableController
}>

const MONEY_COLUMNS: readonly BillingEligibleColumnKey[] = ['totalAmount']
const ELIGIBLE_SKELETON_ROW_COUNT = 5
const ELIGIBLE_SKELETON_ROW_INDEXES = Array.from(
  { length: ELIGIBLE_SKELETON_ROW_COUNT },
  (_, index) => index,
)
const ELIGIBLE_COLUMN_SKELETON_WIDTH: Record<BillingEligibleColumnKey, string> = {
  batchName: '6rem',
  cteNumber: '3rem',
  customerDocument: '7rem',
  customerName: '9rem',
  issuedAt: '6rem',
  nfeNumber: '3rem',
  totalAmount: '5rem',
}

function formatMoment(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : moment.toLocaleString()
}

function cellValue(item: BillingEligibleCte, column: BillingEligibleColumnKey): string {
  if (column === 'cteNumber') return item.cteNumber
  // CT-e sem nota vinculada mantém a linha: a célula é que fica vazia.
  if (column === 'nfeNumber') return item.nfeNumber ?? ''
  if (column === 'customerName') return item.customerName
  if (column === 'customerDocument') return item.customerDocument
  if (column === 'batchName') return item.batchName
  if (column === 'issuedAt') return formatMoment(item.issuedAt)
  return formatAmount(item.totalAmount)
}

export function BillingEligibleTable({ table }: BillingEligibleTableProps): JSX.Element {
  const { t } = useTranslation('billingWorkspace')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false)

  const descriptors = describeBillingEligibleFilterPills({
    advancedConditionCount: table.activeConditionCount,
    filters: table.filters,
    formatDay: formatCalendarDate,
  })
  const pills: readonly FilterPill[] = descriptors.map(toPill)
  const activeCount = pills.length
  const isPageSelected =
    table.visibleItems.length > 0 &&
    table.visibleItems.every((item) => table.selectedIds.includes(item.cteId))

  function sortState(column: BillingEligibleColumnKey): 'ascending' | 'descending' | 'none' {
    if (table.sort === null || table.sort.column !== column) return 'none'
    return table.sort.direction === 'asc' ? 'ascending' : 'descending'
  }

  function sortIndicator(column: BillingEligibleColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return ''
    return table.sort.direction === 'asc' ? '▲' : '▼'
  }

  function sortLabel(column: BillingEligibleColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return t('eligible.sort.none')
    return table.sort.direction === 'asc' ? t('eligible.sort.asc') : t('eligible.sort.desc')
  }

  function toPill(descriptor: BillingEligibleFilterPill): FilterPill {
    const label = t(`${descriptor.labelKey}`)
    if (descriptor.field !== 'advanced') {
      return {
        id: descriptor.field,
        label,
        onRemove: () => table.clearFilterField(descriptor.field),
        removeLabel: t('eligible.removeFilter', { field: label }),
        value: descriptor.value,
      }
    }
    // Só a pílula do avançado abre de volta o painel: as simples se editam no próprio campo.
    return {
      editLabel: t('eligible.editAdvanced'),
      id: descriptor.field,
      label,
      onEdit: () => setIsFilterOpen(true),
      onRemove: () => table.clearFilterField(descriptor.field),
      removeLabel: t('eligible.removeAdvanced'),
      value: t('eligible.advancedPill', { count: table.activeConditionCount }),
    }
  }

  return (
    <section aria-labelledby="billing-eligible-table-title" className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 id="billing-eligible-table-title">{t('eligible.title')}</h2>
        <div className={styles.tableToolbar}>
          <button
            aria-expanded={isFilterOpen}
            aria-label={t('eligible.filtersToggle')}
            className={isFilterOpen ? styles.iconActionActive : styles.iconAction}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            title={t('eligible.filtersToggle')}
            type="button"
          >
            <Icon name="filter" />
            {activeCount > 0 ? <span className={styles.filterCountPill}>{activeCount}</span> : null}
          </button>
          <span className={styles.columnsMenuWrap}>
            <button
              aria-expanded={isColumnsMenuOpen}
              aria-label={t('eligible.columnsToggle')}
              className={isColumnsMenuOpen ? styles.iconActionActive : styles.iconAction}
              onClick={() => setIsColumnsMenuOpen(!isColumnsMenuOpen)}
              title={t('eligible.columnsToggle')}
              type="button"
            >
              <Icon name="columns" />
            </button>
            {isColumnsMenuOpen ? (
              <div className={styles.columnsPopover} role="menu">
                {table.columnPreferences.order.map((column, index) => (
                  <div className={styles.columnRow} key={column}>
                    <span className={styles.checkOption}>
                      <Checkbox
                        checked={table.columnPreferences.visibility[column]}
                        label={t(`eligible.columns.${column}`)}
                        onChange={(checked) => table.hideColumn(column, checked)}
                      />
                    </span>
                    <span className={styles.columnReorder}>
                      <button
                        aria-label={t('eligible.moveColumnUp')}
                        className={styles.iconAction}
                        disabled={index === 0}
                        onClick={() => table.moveColumn(column, 'up')}
                        title={t('eligible.moveColumnUp')}
                        type="button"
                      >
                        <Icon name="arrow-up" />
                      </button>
                      <button
                        aria-label={t('eligible.moveColumnDown')}
                        className={styles.iconAction}
                        disabled={index === table.columnPreferences.order.length - 1}
                        onClick={() => table.moveColumn(column, 'down')}
                        title={t('eligible.moveColumnDown')}
                        type="button"
                      >
                        <Icon name="arrow-down" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </span>
          {activeCount > 0 || table.sort !== null ? (
            <button
              aria-label={t('eligible.clearFilters')}
              className={styles.iconAction}
              onClick={table.clearFilters}
              title={t('eligible.clearFilters')}
              type="button"
            >
              <Icon name="filter-clear" />
            </button>
          ) : null}
        </div>
      </div>

      {isFilterOpen ? <BillingEligibleFilters table={table} /> : null}

      <FilterPills
        clearAllLabel={t('eligible.clearFilters')}
        onClearAll={table.clearFilters}
        pills={pills}
      />

      {table.selection.count > 0 ? (
        <div className={styles.bulkBar}>
          <div className={styles.bulkSummary}>
            <p className={styles.counter}>
              {t('eligible.selectedCount', { count: table.selection.count })}
            </p>
            <p className={styles.counter}>
              {t('eligible.selectedTotal', { value: formatAmount(table.selection.totalAmount) })}
            </p>
            {table.selection.customerDocuments.length > 1 ? (
              <p className={styles.warning} role="alert">
                {t('eligible.multipleCustomers', {
                  count: table.selection.customerDocuments.length,
                })}
              </p>
            ) : null}
          </div>
          <div className={styles.bulkActions}>
            <button className={styles.builderAction} onClick={table.clearSelection} type="button">
              <Icon name="close" />
              {t('eligible.clearSelection')}
            </button>
          </div>
        </div>
      ) : null}

      {table.eligibleQuery.isError ? (
        <p className={styles.hint} role="alert">
          {t('eligible.error')}
        </p>
      ) : null}

      {table.eligibleQuery.isLoading ? (
        <SkeletonGroup className={styles.tableSkeleton} label={t('eligible.loading')}>
          {ELIGIBLE_SKELETON_ROW_INDEXES.map((index) => (
            <div className={styles.skeletonRow} key={index}>
              <Skeleton height="var(--space-5)" width="var(--space-5)" />
              {table.visibleColumns.map((column) => (
                <Skeleton
                  key={column}
                  variant="text"
                  width={ELIGIBLE_COLUMN_SKELETON_WIDTH[column]}
                />
              ))}
            </div>
          ))}
        </SkeletonGroup>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th scope="col">
                  <Checkbox
                    ariaLabel={t('eligible.selectAll')}
                    checked={isPageSelected}
                    indeterminate={!isPageSelected && table.selectedIds.length > 0}
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
                      {t(`eligible.columns.${column}`)}
                      <span aria-hidden="true" className={styles.sortIndicator}>
                        {sortIndicator(column)}
                      </span>
                      <span className={styles.srOnly}>{sortLabel(column)}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.visibleItems.map((item) => (
                <tr aria-selected={table.selectedIds.includes(item.cteId)} key={item.cteId}>
                  <td>
                    <Checkbox
                      ariaLabel={t('eligible.selectRow')}
                      checked={table.selectedIds.includes(item.cteId)}
                      disabled={!table.canCreateInvoices}
                      onChange={() => table.toggleSelection(item.cteId)}
                    />
                  </td>
                  {table.visibleColumns.map((column) => (
                    <td
                      className={MONEY_COLUMNS.includes(column) ? styles.amountCell : undefined}
                      key={column}
                    >
                      {cellValue(item, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {table.eligibleQuery.isLoading ? null : table.visibleItems.length === 0 ? (
        <p className={styles.emptyState}>{t('eligible.empty')}</p>
      ) : (
        <p className={styles.counter}>
          {t('eligible.resultsCount', { count: table.visibleItems.length })}
        </p>
      )}

      <div className={styles.pagination}>
        <button
          aria-label={t('eligible.previousPage')}
          className={styles.iconAction}
          disabled={!table.canGoToPreviousPage}
          onClick={table.goToPreviousPage}
          title={t('eligible.previousPage')}
          type="button"
        >
          <Icon name="page-previous" />
        </button>
        <button
          aria-label={t('eligible.nextPage')}
          className={styles.iconAction}
          disabled={!table.hasNextPage}
          onClick={table.goToNextPage}
          title={t('eligible.nextPage')}
          type="button"
        >
          <Icon name="page-next" />
        </button>
      </div>
    </section>
  )
}
