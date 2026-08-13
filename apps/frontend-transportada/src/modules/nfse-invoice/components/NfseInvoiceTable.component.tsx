/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { CountBadge } from '@/components/ui/count-badge'
import { countFilterPills, FilterPills, type FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatCalendarDate } from '@/modules/shared/calendarDate.service'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { SELECTION_SEPARATOR } from '@/modules/shared/filterPill.service'

import type { NfseInvoiceTableController } from '../hooks/useNfseInvoiceTable.hook'
import type { NfseInvoice } from '../shared/nfseInvoice.types'
import {
  describeNfseInvoiceFilterPills,
  type NfseInvoiceFilterPill,
} from '../shared/nfseInvoiceFilterPills.service'
import type { NfseInvoiceColumnKey } from '../shared/nfseInvoiceTable.service'
import styles from '../styles/nfseInvoice.module.css'
import { NfseInvoiceColumnsMenu } from './NfseInvoiceColumnsMenu.component'
import { NfseInvoiceFilters } from './NfseInvoiceFilters.component'
import { NfseInvoicePagination } from './NfseInvoicePagination.component'
import { NfseInvoiceSelectionBar } from './NfseInvoiceSelectionBar.component'

const EMPTY_CELL = '—'
const READY_STATUSES: readonly string[] = ['authorized']
const ALERT_STATUSES: readonly string[] = ['cancelled', 'failed', 'rejected']
const AMOUNT_COLUMNS: readonly NfseInvoiceColumnKey[] = ['issAmount', 'serviceAmount']
const INVOICE_TABLE_SKELETON_ROW_COUNT = 4

type NfseInvoiceTableProps = Readonly<{
  table: NfseInvoiceTableController
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

function textCell(invoice: NfseInvoice, column: NfseInvoiceColumnKey): string {
  if (column === 'takerLegalName') return invoice.takerLegalName
  if (column === 'documentCount') return String(invoice.documentCount)
  if (column === 'providerNumber') return invoice.providerNumber ?? EMPTY_CELL
  if (column === 'verificationCode') return invoice.verificationCode ?? EMPTY_CELL
  if (column === 'authorizedAt') return formatMoment(invoice.authorizedAt)
  return formatMoment(invoice.createdAt)
}

export function NfseInvoiceTable({ table }: NfseInvoiceTableProps): JSX.Element {
  const { t } = useTranslation('nfseInvoice')
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  const descriptors = describeNfseInvoiceFilterPills({
    filters: table.filters,
    formatDay: formatCalendarDate,
  })
  const pills: readonly FilterPill[] = descriptors.map(toPill)
  const activeCount = countFilterPills(pills)
  const isPageSelected =
    table.visibleInvoices.length > 0 &&
    table.visibleInvoices.every((invoice) => table.selectedIds.includes(invoice.id))

  function toPill(descriptor: NfseInvoiceFilterPill): FilterPill {
    const label = t(descriptor.labelKey)
    const value =
      descriptor.valueKeys === undefined
        ? descriptor.value
        : descriptor.valueKeys.map((key) => t(key)).join(SELECTION_SEPARATOR)
    return {
      id: descriptor.field,
      label,
      onRemove: () => table.clearFilterField(descriptor.field),
      removeLabel: t('table.removeFilter', { field: label }),
      value,
    }
  }

  function renderCell(invoice: NfseInvoice, column: NfseInvoiceColumnKey): ReactNode {
    if (column === 'status') {
      return (
        <span className={statusClassName(invoice.status)}>{t(`status.${invoice.status}`)}</span>
      )
    }
    if (column === 'serviceAmount') return formatAmount(invoice.serviceAmount)
    if (column === 'issAmount') return formatAmount(invoice.issAmount)
    return textCell(invoice, column)
  }

  function sortState(column: NfseInvoiceColumnKey): 'ascending' | 'descending' | 'none' {
    if (table.sort === null || table.sort.column !== column) return 'none'
    return table.sort.direction === 'asc' ? 'ascending' : 'descending'
  }

  function sortIndicator(column: NfseInvoiceColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return ''
    return table.sort.direction === 'asc' ? '▲' : '▼'
  }

  function sortLabel(column: NfseInvoiceColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return t('table.sortNone')
    return table.sort.direction === 'asc' ? t('table.sortAsc') : t('table.sortDesc')
  }

  function renderColumnHeaders(): JSX.Element {
    return (
      <tr>
        <th scope="col">
          <Checkbox
            ariaLabel={t('table.selectAll')}
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
              {t(`columns.${column}`)}
              <span aria-hidden="true" className={styles.sortIndicator}>
                {sortIndicator(column)}
              </span>
              <span className={styles.srOnly}>{sortLabel(column)}</span>
            </button>
          </th>
        ))}
      </tr>
    )
  }

  function renderSkeletonRow(rowIndex: number): JSX.Element {
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
      </tr>
    )
  }

  return (
    <section aria-labelledby="nfse-invoice-table-title" className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 id="nfse-invoice-table-title">{t('table.title')}</h2>
        <div className={styles.tableToolbar}>
          <button
            aria-expanded={isFilterOpen}
            aria-label={t('table.toggleFilters')}
            className={isFilterOpen ? styles.iconActionActive : styles.iconAction}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            title={t('table.toggleFilters')}
            type="button"
          >
            <Icon name="filter" />
            <CountBadge count={activeCount} />
          </button>
          <NfseInvoiceColumnsMenu table={table} />
          {/* Com pílula na tela o "limpar tudo" já está lá embaixo: o ícone só cobre a ordenação. */}
          {pills.length === 0 && table.sort !== null ? (
            <button
              aria-label={t('table.clearFilters')}
              className={styles.iconAction}
              onClick={table.clearFilters}
              title={t('table.clearFilters')}
              type="button"
            >
              <Icon name="filter-clear" />
            </button>
          ) : null}
        </div>
      </div>

      {isFilterOpen ? <NfseInvoiceFilters table={table} /> : null}

      <FilterPills
        clearAllLabel={t('table.clearFilters')}
        onClearAll={table.clearFilters}
        pills={pills}
      />

      <p className={styles.counter}>{t('table.counter', { count: table.loadedCount })}</p>

      <NfseInvoiceSelectionBar table={table} />

      {table.invoicesQuery.isLoading ? (
        <SkeletonGroup className={styles.tableScroll} label={t('list.loading')}>
          <table className={styles.dataTable}>
            <thead>{renderColumnHeaders()}</thead>
            <tbody>
              {Array.from({ length: INVOICE_TABLE_SKELETON_ROW_COUNT }, (_, rowIndex) =>
                renderSkeletonRow(rowIndex),
              )}
            </tbody>
          </table>
        </SkeletonGroup>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <thead>{renderColumnHeaders()}</thead>
            <tbody>
              {table.visibleInvoices.map((invoice) => (
                <tr aria-selected={table.selectedIds.includes(invoice.id)} key={invoice.id}>
                  <td>
                    <Checkbox
                      ariaLabel={t('table.select')}
                      checked={table.selectedIds.includes(invoice.id)}
                      onChange={() => table.toggleSelection(invoice.id)}
                    />
                  </td>
                  {table.visibleColumns.map((column) => (
                    <td key={column}>{renderCell(invoice, column)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {table.invoicesQuery.isError ? (
        <p className={styles.hint} role="alert">
          {t('feedback.requestFailed')}
        </p>
      ) : null}

      {!table.invoicesQuery.isLoading && table.visibleInvoices.length === 0 ? (
        <p className={styles.hint}>{t('table.empty')}</p>
      ) : null}

      <NfseInvoicePagination table={table} />
    </section>
  )
}
