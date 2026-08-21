/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'
import { formatTaxId, normalizeTaxId } from '@/modules/shared/taxId.service'

import type { NfseInvoiceTableController } from '../hooks/useNfseInvoiceTable.hook'
import { NFSE_INVOICE_STATUSES } from '../shared/nfseInvoice.types'
import styles from '../styles/nfseInvoice.module.css'
import { NfseInvoiceAdvancedFilterBuilder } from './NfseInvoiceAdvancedFilterBuilder.component'

type NfseInvoiceFiltersProps = Readonly<{
  table: NfseInvoiceTableController
}>

export function NfseInvoiceFilters({ table }: NfseInvoiceFiltersProps): JSX.Element {
  const { t } = useTranslation('nfseInvoice')

  const modeOptions: readonly SelectOption[] = [
    { label: t('filters.modeSimple'), value: 'simple' },
    { label: t('filters.modeAdvanced'), value: 'advanced' },
  ]

  return (
    <div className={styles.filterPanel}>
      <div className={styles.modeSwitch}>
        <Select
          ariaLabel={t('filters.mode')}
          clearable={false}
          compact
          onChange={(value) => table.setFilterMode(value === 'advanced' ? 'advanced' : 'simple')}
          options={modeOptions}
          placeholder={t('filters.mode')}
          value={table.filterMode}
        />
      </div>

      {table.filterMode === 'advanced' ? (
        <NfseInvoiceAdvancedFilterBuilder controls={table.advancedFilter} />
      ) : (
        <>
          <div className={styles.fieldGrid}>
            <label>
              <span>{t('filters.takerTaxId')}</span>
              <input
                onChange={(event) =>
                  table.setTextFilter('takerTaxId', normalizeTaxId(event.target.value))
                }
                placeholder={t('filters.takerTaxIdPlaceholder')}
                type="text"
                value={formatTaxId(table.filters.takerTaxId)}
              />
            </label>
            <label>
              <span>{t('filters.createdRange')}</span>
              <DateRangePicker
                ariaLabel={t('filters.createdRange')}
                clearLabel={t('dateRange.clear')}
                from={table.filters.createdFrom}
                nextMonthLabel={t('dateRange.nextMonth')}
                onChange={(from, until) => {
                  table.setTextFilter('createdFrom', from)
                  table.setTextFilter('createdUntil', until)
                }}
                placeholder={t('dateRange.placeholder')}
                previousMonthLabel={t('dateRange.previousMonth')}
                to={table.filters.createdUntil}
              />
            </label>
          </div>

          <fieldset className={styles.statusChips}>
            <legend className={styles.hint}>{t('filters.statuses')}</legend>
            {NFSE_INVOICE_STATUSES.map((status) => {
              const isActive = table.filters.statuses.includes(status)
              return (
                <label
                  className={
                    isActive ? `${styles.statusChip} ${styles.statusChipActive}` : styles.statusChip
                  }
                  key={status}
                >
                  <Checkbox checked={isActive} onChange={() => table.toggleStatus(status)} />
                  {t(`status.${status}`)}
                </label>
              )
            })}
          </fieldset>
        </>
      )}

      <div className={styles.toolbar}>
        <p className={styles.counter}>
          {t('table.activeFilters', { count: table.activeFilterCount })}
        </p>
        {table.activeFilterCount > 0 || table.sort !== null ? (
          <button className={styles.builderAction} onClick={table.clearFilters} type="button">
            <Icon name="filter-clear" />
            <span>{t('table.clearFilters')}</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
