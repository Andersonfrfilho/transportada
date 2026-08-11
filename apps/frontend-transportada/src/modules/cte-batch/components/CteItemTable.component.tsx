/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { FilterPills, countFilterPills, type FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'
import type { SelectOption } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatCalendarDate } from '@/modules/shared/calendarDate.service'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { SELECTION_SEPARATOR } from '@/modules/shared/filterPill.service'

import { useCteBillingDialog } from '../hooks/useCteBillingDialog.hook'
import type { CteItemTableController } from '../hooks/useCteItemTable.hook'
import type { CompanyCteItem } from '../shared/cteBatchItem.types'
import { toInvoiceNumbers, type CteItemColumnKey } from '../shared/cteBatchItemTable.service'
import {
  describeCteItemFilterPills,
  type CteItemFilterPill,
} from '../shared/cteItemFilterPills.service'
import styles from '../styles/cteBatch.module.css'
import { CteBillingDialog } from './CteBillingDialog.component'
import { CteItemColumnsMenu } from './CteItemColumnsMenu.component'
import { CteItemFilters } from './CteItemFilters.component'
import { CteItemPagination } from './CteItemPagination.component'
import { CteItemSelectionBar } from './CteItemSelectionBar.component'

const EMPTY_CELL = '—'
const READY_STATUSES: readonly string[] = ['authorized']
const ALERT_STATUSES: readonly string[] = ['cancelled', 'failed', 'rejected']
const AMOUNT_COLUMNS: readonly CteItemColumnKey[] = ['baseAmount', 'fiscalAmount', 'totalAmount']
const ITEM_TABLE_SKELETON_ROW_COUNT = 4

type CteItemTableProps = Readonly<{
  batchOptions: readonly SelectOption[]
  table: CteItemTableController
}>

function statusClassName(status: string): string {
  if (READY_STATUSES.includes(status)) return `${styles.statusBadge} ${styles.statusReady}`
  if (ALERT_STATUSES.includes(status)) return `${styles.statusBadge} ${styles.statusAlert}`
  return `${styles.statusBadge}`
}

function formatMoment(value: null | string): string {
  if (value === null) return EMPTY_CELL
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : moment.toLocaleString()
}

function amountCell(item: CompanyCteItem, column: CteItemColumnKey): string {
  if (column === 'baseAmount') return formatAmount(item.baseAmount)
  if (column === 'fiscalAmount') return formatAmount(item.fiscalAmount)
  return formatAmount(item.totalAmount)
}

function textCell(item: CompanyCteItem, column: CteItemColumnKey): string {
  if (column === 'cteNumber') return item.fiscalNumber ?? EMPTY_CELL
  if (column === 'batchName') return item.batchName
  if (column === 'invoiceNumbers') return toInvoiceNumbers(item) ?? EMPTY_CELL
  if (column === 'issuedAt') return formatMoment(item.authorizedAt)
  if (column === 'createdAt') return formatMoment(item.createdAt)
  if (column === 'lastErrorCode') return item.lastErrorCode ?? EMPTY_CELL
  return item.accessKey ?? EMPTY_CELL
}

export function CteItemTable({ batchOptions, table }: CteItemTableProps) {
  const { t } = useTranslation('cteBatch')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false)
  const billingDialog = useCteBillingDialog({
    batchIds: null,
    onClose: table.closeBilling,
    request: table.billingRequest,
  })

  const descriptors = describeCteItemFilterPills({
    filters: table.filters,
    formatDay: formatCalendarDate,
  })
  const pills: readonly FilterPill[] = descriptors.map(toPill)
  const activeCount = countFilterPills(pills)
  const isPageSelected =
    table.visibleItems.length > 0 &&
    table.visibleItems.every((item) => table.selectedIds.includes(item.id))

  function toPill(descriptor: CteItemFilterPill): FilterPill {
    const label = t(descriptor.labelKey)
    const value =
      descriptor.valueKeys === undefined
        ? descriptor.value
        : descriptor.valueKeys.map((key) => t(key)).join(SELECTION_SEPARATOR)
    return {
      id: descriptor.field,
      label,
      onRemove: () => table.clearFilterField(descriptor.field),
      removeLabel: t('cteItems.removeFilter', { field: label }),
      value,
    }
  }

  /** Número trocado sem explicação parece erro do sistema: a marca conta de onde ele veio. */
  function renderCteNumber(item: CompanyCteItem) {
    const change = item.fiscalNumberChange
    if (change === null) return item.fiscalNumber ?? EMPTY_CELL

    const hint = t(`cteItems.fiscalNumberChange.${change.reason}`, {
      previousNumber: change.previousNumber,
      rejectionCode: change.rejectionCode,
    })

    return (
      <span className={styles.numberChange}>
        {item.fiscalNumber ?? EMPTY_CELL}
        <span aria-label={hint} className={styles.numberChangeMark} role="img" title={hint}>
          <Icon name="alert" size="sm" />
        </span>
      </span>
    )
  }

  function renderCell(item: CompanyCteItem, column: CteItemColumnKey) {
    if (column === 'cteNumber') return renderCteNumber(item)
    if (column === 'status') {
      return <span className={statusClassName(item.status)}>{t(`itemStatus.${item.status}`)}</span>
    }
    if (column === 'billingStatus') {
      return (
        <span className={styles.statusChip}>{t(`itemBillingStatus.${item.billingStatus}`)}</span>
      )
    }
    return AMOUNT_COLUMNS.includes(column) ? amountCell(item, column) : textCell(item, column)
  }

  function sortState(column: CteItemColumnKey): 'ascending' | 'descending' | 'none' {
    if (table.sort === null || table.sort.column !== column) return 'none'
    return table.sort.direction === 'asc' ? 'ascending' : 'descending'
  }

  function sortIndicator(column: CteItemColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return ''
    return table.sort.direction === 'asc' ? '▲' : '▼'
  }

  function sortLabel(column: CteItemColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return t('sort.none')
    return table.sort.direction === 'asc' ? t('sort.asc') : t('sort.desc')
  }

  function renderColumnHeaders() {
    return (
      <tr>
        <th scope="col">
          <Checkbox
            ariaLabel={t('cteItems.selectAll')}
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
              {t(`cteItems.columns.${column}`)}
              <span className={styles.sortIndicator} aria-hidden="true">
                {sortIndicator(column)}
              </span>
              <span className={styles.srOnly}>{sortLabel(column)}</span>
            </button>
          </th>
        ))}
        <th scope="col">
          <span className={styles.srOnly}>{t('cteItems.downloadDacte')}</span>
        </th>
      </tr>
    )
  }

  /** O DACTE nasce do XML autorizado: linha sem autorização não tem papel a baixar. */
  function renderDacteAction(item: CompanyCteItem) {
    if (!table.canDownloadDacte(item)) return null

    return (
      <button
        aria-label={t('cteItems.downloadDacte')}
        className={styles.iconAction}
        disabled={table.downloadingDacteId === item.id}
        onClick={() => table.downloadDacte(item)}
        title={t('cteItems.downloadDacte')}
        type="button"
      >
        <Icon name="download" />
      </button>
    )
  }

  function renderSkeletonRow(rowIndex: number) {
    return (
      <tr key={rowIndex}>
        <td>
          <Skeleton height="var(--icon-size-md)" variant="block" width="var(--icon-size-md)" />
        </td>
        {table.visibleColumns.map((column) => (
          <td key={column}>
            <Skeleton variant="text" width={AMOUNT_COLUMNS.includes(column) ? '4rem' : '70%'} />
          </td>
        ))}
        <td>
          <Skeleton height="var(--icon-size-md)" variant="block" width="var(--icon-size-md)" />
        </td>
      </tr>
    )
  }

  return (
    <section className={styles.panel} aria-labelledby="cte-item-table-title">
      <div className={styles.panelHead}>
        <h2 id="cte-item-table-title">{t('cteItems.title')}</h2>
        <div className={styles.tableToolbar}>
          <button
            aria-expanded={isFilterOpen}
            aria-label={t('cteItems.filters.title')}
            className={isFilterOpen ? styles.iconActionActive : styles.iconAction}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            title={t('cteItems.filters.title')}
            type="button"
          >
            <Icon name="filter" />
            {activeCount > 0 ? <span className={styles.filterCountPill}>{activeCount}</span> : null}
          </button>
          <span className={styles.columnsMenuWrap}>
            <button
              aria-expanded={isColumnsMenuOpen}
              aria-label={t('cteItems.columnsMenu')}
              className={isColumnsMenuOpen ? styles.iconActionActive : styles.iconAction}
              onClick={() => setIsColumnsMenuOpen(!isColumnsMenuOpen)}
              title={t('cteItems.columnsMenu')}
              type="button"
            >
              <Icon name="columns" />
            </button>
            {isColumnsMenuOpen ? <CteItemColumnsMenu table={table} /> : null}
          </span>
          {/* Com pílula na tela o "limpar tudo" já está lá embaixo: o ícone só cobre a ordenação. */}
          {pills.length === 0 && table.sort !== null ? (
            <button
              aria-label={t('cteItems.clearFilters')}
              className={styles.iconAction}
              onClick={table.clearFilters}
              title={t('cteItems.clearFilters')}
              type="button"
            >
              <Icon name="filter-clear" />
            </button>
          ) : null}
        </div>
      </div>

      {isFilterOpen ? <CteItemFilters batchOptions={batchOptions} table={table} /> : null}

      <FilterPills
        clearAllLabel={t('cteItems.clearFilters')}
        onClearAll={table.clearFilters}
        pills={pills}
      />

      <CteItemSelectionBar table={table} />
      <CteBillingDialog dialog={billingDialog} />

      {table.itemsQuery.isLoading ? (
        <SkeletonGroup className={styles.tableScroll} label={t('cteItems.loading')}>
          <table className={styles.dataTable}>
            <thead>{renderColumnHeaders()}</thead>
            <tbody>
              {Array.from({ length: ITEM_TABLE_SKELETON_ROW_COUNT }, (_, rowIndex) =>
                renderSkeletonRow(rowIndex),
              )}
            </tbody>
          </table>
        </SkeletonGroup>
      ) : null}
      {table.itemsQuery.isError ? (
        <p className={styles.hint} role="alert">
          {t('cteItems.error')}
        </p>
      ) : null}

      {table.itemsQuery.isLoading ? null : (
        <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <thead>{renderColumnHeaders()}</thead>
            <tbody>
              {table.visibleItems.map((item) => (
                <tr aria-selected={table.selectedIds.includes(item.id)} key={item.id}>
                  <td>
                    <Checkbox
                      ariaLabel={t('cteItems.select')}
                      checked={table.selectedIds.includes(item.id)}
                      onChange={() => table.toggleSelection(item.id)}
                    />
                  </td>
                  {table.visibleColumns.map((column) => (
                    <td key={column}>{renderCell(item, column)}</td>
                  ))}
                  <td>{renderDacteAction(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {table.dacteErrorKey === null ? null : (
        <p className={styles.hint} role="alert">
          {t(table.dacteErrorKey)}
        </p>
      )}

      {!table.itemsQuery.isLoading && table.visibleItems.length === 0 ? (
        <p className={styles.hint}>{t('cteItems.empty')}</p>
      ) : null}

      <CteItemPagination table={table} />
    </section>
  )
}
