/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'

import type { CteItemTableController } from '../hooks/useCteItemTable.hook'
import {
  CTE_ITEM_BILLING_STATUS_VALUES,
  CTE_ITEM_STATUS_VALUES,
} from '../shared/cteBatchItemTable.service'
import styles from '../styles/cteBatch.module.css'

const NUMBER_QUERY_FIELDS = ['cteNumberQuery', 'invoiceNumberQuery'] as const

type CteItemFiltersProps = Readonly<{
  batchOptions: readonly SelectOption[]
  table: CteItemTableController
}>

export function CteItemFilters({ batchOptions, table }: CteItemFiltersProps) {
  const { t } = useTranslation('cteBatch')

  return (
    <div className={styles.filterPanel}>
      <div className={styles.fieldGrid}>
        <label>
          {t('cteItems.filters.batch')}
          <Select
            ariaLabel={t('cteItems.filters.batch')}
            clearable
            compact
            onChange={(value) => table.setTextFilter('batchId', value)}
            options={batchOptions}
            placeholder={t('cteItems.filters.allBatches')}
            value={table.filters.batchId}
          />
        </label>
        <label>
          {t('cteItems.filters.issuedRange')}
          <DateRangePicker
            ariaLabel={t('cteItems.filters.issuedRange')}
            clearLabel={t('dateRange.clear')}
            from={table.filters.issuedFrom}
            nextMonthLabel={t('dateRange.nextMonth')}
            onChange={(from, to) => {
              table.setTextFilter('issuedFrom', from)
              table.setTextFilter('issuedTo', to)
            }}
            placeholder={t('dateRange.placeholder')}
            previousMonthLabel={t('dateRange.previousMonth')}
            to={table.filters.issuedTo}
          />
        </label>
        {NUMBER_QUERY_FIELDS.map((field) => (
          <label key={field}>
            {t(`cteItems.filters.${field}`)}
            <input
              onChange={(event) => table.setTextFilter(field, event.target.value)}
              placeholder={t('cteItems.filters.numberQueryPlaceholder')}
              type="text"
              value={table.filters[field]}
            />
          </label>
        ))}
      </div>

      <fieldset className={styles.statusChips}>
        <legend className={styles.hint}>{t('cteItems.filters.status')}</legend>
        {CTE_ITEM_STATUS_VALUES.map((status) => (
          <label
            className={`${styles.statusChip} ${
              table.filters.statuses.includes(status) ? styles.statusChipActive : ''
            }`}
            key={status}
          >
            <Checkbox
              checked={table.filters.statuses.includes(status)}
              onChange={() => table.toggleStatus(status)}
            />
            {t(`itemStatus.${status}`)}
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.statusChips}>
        <legend className={styles.hint}>{t('cteItems.filters.billingStatus')}</legend>
        {CTE_ITEM_BILLING_STATUS_VALUES.map((status) => (
          <label
            className={`${styles.statusChip} ${
              table.filters.billingStatuses.includes(status) ? styles.statusChipActive : ''
            }`}
            key={status}
          >
            <Checkbox
              checked={table.filters.billingStatuses.includes(status)}
              onChange={() => table.toggleBillingStatus(status)}
            />
            {t(`itemBillingStatus.${status}`)}
          </label>
        ))}
      </fieldset>

      <div className={styles.toolbar}>
        <p className={styles.counter}>
          {t('cteItems.filters.active', { count: table.activeFilterCount })}
        </p>
        <Button
          disabled={!table.canExportFiltered || table.isExporting}
          onClick={() => table.exportFiltered()}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="export" />
          {table.isExporting
            ? t('cteItems.export.pending')
            : t('cteItems.exportFiltered', { count: table.activeFilterCount })}
        </Button>
        {table.activeFilterCount > 0 || table.sort !== null ? (
          <Button onClick={table.clearFilters} size="sm" type="button" variant="secondary">
            <Icon name="filter-clear" />
            {t('cteItems.clearFilters')}
          </Button>
        ) : null}
      </div>
      {table.exportErrorKey === null ? null : (
        <p className={styles.hint} role="alert">
          {t(table.exportErrorKey)}
        </p>
      )}
    </div>
  )
}
