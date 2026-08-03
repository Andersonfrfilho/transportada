/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { FilterPills, type FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'
import { formatCalendarDate } from '@/modules/shared/calendarDate.service'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import type { BillingInvoiceTableController } from '../hooks/useBillingInvoiceTable.hook'
import type { BillingInvoiceSummary } from '../shared/billingClient.service'
import { resolveBillingDocumentActionState } from '../shared/billingDocumentDownload.service'
import {
  describeBillingInvoiceFilterPills,
  type BillingInvoiceFilterPill,
} from '../shared/billingInvoiceFilterPills.service'
import {
  BILLING_INVOICE_DATE_RANGES,
  type BillingInvoiceColumnKey,
  type BillingInvoiceDateRangeField,
} from '../shared/billingInvoiceTable.service'
import styles from '../styles/billingInvoiceTable.module.css'

const READY_STATUSES: readonly string[] = ['issued']
const ALERT_STATUSES: readonly string[] = ['cancelled']
const TEXT_FILTER_FIELDS: readonly (keyof BillingInvoiceTableController['filters'])[] = [
  'customerDocument',
  'invoiceNumber',
]
const DATE_RANGE_FILTER_FIELDS: readonly BillingInvoiceDateRangeField[] = [
  'issuedRange',
  'dueRange',
]

type BillingInvoiceTableProps = Readonly<{
  table: BillingInvoiceTableController
}>

function statusClassName(status: string): string {
  if (READY_STATUSES.includes(status)) return `${styles.statusBadge} ${styles.statusReady}`
  if (ALERT_STATUSES.includes(status)) return `${styles.statusBadge} ${styles.statusAlert}`
  return `${styles.statusBadge}`
}

function formatMoment(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : moment.toLocaleString()
}

function cellValue(item: BillingInvoiceSummary, column: BillingInvoiceColumnKey): string {
  if (column === 'invoiceNumber') return String(item.invoiceNumber)
  if (column === 'customerName') return item.customer.name
  if (column === 'customerDocument') return item.customer.document
  if (column === 'issuedAt') return formatMoment(item.issuedAt)
  if (column === 'dueDate') return formatCalendarDate(item.dueDate)
  if (column === 'itemCount') return String(item.itemCount)
  if (column === 'totalAmount') return formatAmount(item.totalAmount)
  return formatMoment(item.createdAt)
}

/** A linha inteira abre o detalhe; os controles dentro dela seguem respondendo ao próprio clique. */
function stopRowPropagation(event: MouseEvent<HTMLTableCellElement>): void {
  event.stopPropagation()
}

export function BillingInvoiceTable({ table }: BillingInvoiceTableProps) {
  const { t } = useTranslation('billingWorkspace')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false)

  const statusOptions: readonly SelectOption[] = [
    { label: t('invoices.statusOptions.issued'), value: 'issued' },
    { label: t('invoices.statusOptions.cancelled'), value: 'cancelled' },
  ]
  const descriptors = describeBillingInvoiceFilterPills({
    filters: table.filters,
    formatDay: formatCalendarDate,
  })
  const pills: readonly FilterPill[] = descriptors.map(toPill)
  const activeCount = pills.length
  const isPageSelected =
    table.visibleItems.length > 0 &&
    table.visibleItems.every((item) => table.selectedIds.includes(item.id))

  function toPill(descriptor: BillingInvoiceFilterPill): FilterPill {
    const label = t(descriptor.labelKey)
    return {
      id: descriptor.field,
      label,
      onRemove: () => table.clearFilterField(descriptor.field),
      removeLabel: t('invoices.removeFilter', { field: label }),
      value: descriptor.valueKey === undefined ? descriptor.value : t(descriptor.valueKey),
    }
  }

  function sortState(column: BillingInvoiceColumnKey): 'ascending' | 'descending' | 'none' {
    if (table.sort === null || table.sort.column !== column) return 'none'
    return table.sort.direction === 'asc' ? 'ascending' : 'descending'
  }

  function sortIndicator(column: BillingInvoiceColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return ''
    return table.sort.direction === 'asc' ? '▲' : '▼'
  }

  function sortLabel(column: BillingInvoiceColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return t('invoices.sort.none')
    return table.sort.direction === 'asc' ? t('invoices.sort.asc') : t('invoices.sort.desc')
  }

  function renderDocumentAction(invoiceId: string): JSX.Element {
    const actionState = resolveBillingDocumentActionState({
      canGenerate: table.canGenerateDocuments,
      invoiceId,
      pendingInvoiceId: table.pendingDocumentInvoiceId,
    })

    return (
      <button
        className={styles.documentAction}
        disabled={actionState.isDisabled}
        onClick={() => table.generateDocument(invoiceId)}
        type="button"
      >
        <Icon name={actionState.isPending ? 'spinner' : 'document'} />
        {actionState.isPending
          ? t('invoices.documentAction.generating')
          : t('invoices.documentAction.generate')}
      </button>
    )
  }

  return (
    <section aria-labelledby="billing-invoice-table-title" className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 id="billing-invoice-table-title">{t('invoices.title')}</h2>
        <div className={styles.tableToolbar}>
          <button
            aria-expanded={isFilterOpen}
            aria-label={t('invoices.filtersToggle')}
            className={isFilterOpen ? styles.iconActionActive : styles.iconAction}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            title={t('invoices.filtersToggle')}
            type="button"
          >
            <Icon name="filter" />
            {activeCount > 0 ? <span className={styles.filterCountPill}>{activeCount}</span> : null}
          </button>
          <span className={styles.columnsMenuWrap}>
            <button
              aria-expanded={isColumnsMenuOpen}
              aria-label={t('invoices.columnsToggle')}
              className={isColumnsMenuOpen ? styles.iconActionActive : styles.iconAction}
              onClick={() => setIsColumnsMenuOpen(!isColumnsMenuOpen)}
              title={t('invoices.columnsToggle')}
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
                        label={t(`invoices.columns.${column}`)}
                        onChange={(checked) => table.hideColumn(column, checked)}
                      />
                    </span>
                    <span className={styles.columnReorder}>
                      <button
                        aria-label={t('invoices.moveColumnUp')}
                        className={styles.iconAction}
                        disabled={index === 0}
                        onClick={() => table.moveColumn(column, 'up')}
                        title={t('invoices.moveColumnUp')}
                        type="button"
                      >
                        <Icon name="arrow-up" />
                      </button>
                      <button
                        aria-label={t('invoices.moveColumnDown')}
                        className={styles.iconAction}
                        disabled={index === table.columnPreferences.order.length - 1}
                        onClick={() => table.moveColumn(column, 'down')}
                        title={t('invoices.moveColumnDown')}
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
              aria-label={t('invoices.clearFilters')}
              className={styles.iconAction}
              onClick={table.clearFilters}
              title={t('invoices.clearFilters')}
              type="button"
            >
              <Icon name="filter-clear" />
            </button>
          ) : null}
        </div>
      </div>

      {isFilterOpen ? (
        <div className={styles.filterPanel}>
          <div className={styles.fieldGrid}>
            {TEXT_FILTER_FIELDS.map((field) => (
              <label key={field}>
                <span>{t(`invoices.filters.${field}`)}</span>
                <input
                  onChange={(event) => table.setTextFilter(field, event.target.value)}
                  type="text"
                  value={table.filters[field]}
                />
              </label>
            ))}
            <label>
              <span>{t('invoices.filters.status')}</span>
              <Select
                ariaLabel={t('invoices.filters.status')}
                clearable
                onChange={(value) => table.setTextFilter('status', value)}
                options={statusOptions}
                placeholder={t('invoices.statusOptions.all')}
                value={table.filters.status}
              />
            </label>
            {DATE_RANGE_FILTER_FIELDS.map((field) => {
              const range = BILLING_INVOICE_DATE_RANGES[field]
              return (
                <label key={field}>
                  <span>{t(`invoices.filters.${field}`)}</span>
                  <DateRangePicker
                    ariaLabel={t(`invoices.filters.${field}`)}
                    clearLabel={t('dateRange.clear')}
                    from={table.filters[range.from]}
                    nextMonthLabel={t('dateRange.nextMonth')}
                    onChange={(from, to) => table.setDateRange(field, from, to)}
                    placeholder={t('dateRange.placeholder')}
                    previousMonthLabel={t('dateRange.previousMonth')}
                    to={table.filters[range.to]}
                  />
                </label>
              )
            })}
          </div>
        </div>
      ) : null}

      <FilterPills
        clearAllLabel={t('invoices.clearFilters')}
        onClearAll={table.clearFilters}
        pills={pills}
      />

      {table.selectedIds.length > 0 ? (
        <div className={styles.bulkBar}>
          <p className={styles.counter}>
            {t('invoices.selectedCount', { count: table.selectedIds.length })}
          </p>
          <div className={styles.bulkActions}>
            <button onClick={table.clearSelection} type="button">
              <Icon name="close" />
              {t('invoices.clearSelection')}
            </button>
          </div>
        </div>
      ) : null}

      {table.invoicesQuery.isLoading ? (
        <p className={styles.hint}>{t('invoices.loading')}</p>
      ) : null}
      {table.invoicesQuery.isError ? (
        <p className={styles.hint} role="alert">
          {t('invoices.error')}
        </p>
      ) : null}
      {table.documentMessageKey === null ? null : (
        <p className={styles.hint} role="alert">
          {t(table.documentMessageKey)}
        </p>
      )}

      <div className={styles.tableScroll}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th scope="col">
                <Checkbox
                  ariaLabel={t('invoices.selectAll')}
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
                    {t(`invoices.columns.${column}`)}
                    <span aria-hidden="true" className={styles.sortIndicator}>
                      {sortIndicator(column)}
                    </span>
                    <span className={styles.srOnly}>{sortLabel(column)}</span>
                  </button>
                </th>
              ))}
              <th scope="col">{t('invoices.documentAction.columnHeader')}</th>
            </tr>
          </thead>
          <tbody>
            {table.visibleItems.map((item) => (
              <tr
                aria-selected={table.selectedIds.includes(item.id)}
                className={styles.dataRow}
                key={item.id}
                onClick={() => table.openInvoice(item.id)}
              >
                <td onClick={stopRowPropagation}>
                  <Checkbox
                    ariaLabel={t('invoices.selectRow')}
                    checked={table.selectedIds.includes(item.id)}
                    onChange={() => table.toggleSelection(item.id)}
                  />
                </td>
                {table.visibleColumns.map((column) => {
                  if (column === 'status') {
                    return (
                      <td key={column}>
                        <span className={statusClassName(item.status)}>
                          {t(`invoices.statusOptions.${item.status}`)}
                        </span>
                      </td>
                    )
                  }
                  if (column === 'invoiceNumber') {
                    return (
                      <td key={column}>
                        <button
                          aria-label={t('invoices.openDetail')}
                          className={styles.openDetailAction}
                          onClick={() => table.openInvoice(item.id)}
                          title={t('invoices.openDetail')}
                          type="button"
                        >
                          {cellValue(item, column)}
                        </button>
                      </td>
                    )
                  }
                  return <td key={column}>{cellValue(item, column)}</td>
                })}
                <td onClick={stopRowPropagation}>{renderDocumentAction(item.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.visibleItems.length === 0 && !table.invoicesQuery.isLoading ? (
        <p className={styles.hint}>{t('invoices.empty')}</p>
      ) : (
        <p className={styles.counter}>
          {t('invoices.resultsCount', { count: table.visibleItems.length })}
        </p>
      )}

      <div className={styles.pagination}>
        <button
          aria-label={t('invoices.previousPage')}
          className={styles.iconAction}
          disabled={!table.canGoToPreviousPage}
          onClick={table.goToPreviousPage}
          title={t('invoices.previousPage')}
          type="button"
        >
          <Icon name="page-previous" />
        </button>
        <button
          aria-label={t('invoices.nextPage')}
          className={styles.iconAction}
          disabled={!table.hasNextPage}
          onClick={table.goToNextPage}
          title={t('invoices.nextPage')}
          type="button"
        >
          <Icon name="page-next" />
        </button>
      </div>
    </section>
  )
}
