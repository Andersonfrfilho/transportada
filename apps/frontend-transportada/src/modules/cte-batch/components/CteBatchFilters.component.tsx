/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { CteBatchTableController } from '../hooks/useCteBatchTable.hook'
import { CTE_BATCH_STATUSES } from '../shared/cteBatchTable.service'
import styles from '../styles/cteBatch.module.css'
import { CteBatchAdvancedFilterBuilder } from './CteBatchAdvancedFilterBuilder.component'

type CteBatchFiltersProps = Readonly<{ table: CteBatchTableController }>

export function CteBatchFilters({ table }: CteBatchFiltersProps) {
  const { t } = useTranslation('cteBatch')

  return (
    <section className={styles.panel} aria-labelledby="cte-batch-filters-title">
      <div className={styles.panelHead}>
        <h2 id="cte-batch-filters-title">{t('filters.title')}</h2>
        <div className={styles.modeSwitch}>
          <Button
            aria-pressed={table.filterMode === 'simple'}
            onClick={() => table.setFilterMode('simple')}
            size="sm"
            type="button"
            variant={table.filterMode === 'simple' ? 'default' : 'ghost'}
          >
            {t('filters.simple')}
          </Button>
          <Button
            aria-pressed={table.filterMode === 'advanced'}
            onClick={() => table.setFilterMode('advanced')}
            size="sm"
            type="button"
            variant={table.filterMode === 'advanced' ? 'default' : 'ghost'}
          >
            {t('filters.advanced')}
          </Button>
        </div>
      </div>

      {table.filterMode === 'simple' ? (
        <>
          <div className={styles.fieldGrid}>
            <label>
              {t('filters.name')}
              <input
                onChange={(event) => table.setTextFilter('nameContains', event.target.value)}
                type="search"
                value={table.filters.nameContains}
              />
            </label>
            <label>
              {t('filters.itemCountFrom')}
              <input
                min={0}
                onChange={(event) => table.setTextFilter('itemCountFrom', event.target.value)}
                type="number"
                value={table.filters.itemCountFrom}
              />
            </label>
            <label>
              {t('filters.itemCountTo')}
              <input
                min={0}
                onChange={(event) => table.setTextFilter('itemCountTo', event.target.value)}
                type="number"
                value={table.filters.itemCountTo}
              />
            </label>
            <label>
              {t('filters.createdFrom')}
              <input
                onChange={(event) => table.setTextFilter('createdFrom', event.target.value)}
                type="date"
                value={table.filters.createdFrom}
              />
            </label>
            <label>
              {t('filters.createdTo')}
              <input
                onChange={(event) => table.setTextFilter('createdTo', event.target.value)}
                type="date"
                value={table.filters.createdTo}
              />
            </label>
          </div>
          <fieldset className={styles.statusChips}>
            <legend className={styles.hint}>{t('filters.status')}</legend>
            {CTE_BATCH_STATUSES.map((status) => (
              <label
                className={`${styles.statusChip} ${
                  table.filters.statuses.includes(status) ? styles.statusChipActive : ''
                }`}
                key={status}
              >
                <input
                  checked={table.filters.statuses.includes(status)}
                  onChange={() => table.toggleStatus(status)}
                  type="checkbox"
                />
                {t(`status.${status}`)}
              </label>
            ))}
          </fieldset>
        </>
      ) : (
        <CteBatchAdvancedFilterBuilder table={table} />
      )}

      <div className={styles.toolbar}>
        <p className={styles.counter}>{t('filters.active', { count: table.activeFilterCount })}</p>
        {table.activeFilterCount > 0 || table.sort !== null ? (
          <Button onClick={table.clearFilters} size="sm" type="button" variant="secondary">
            {t('filters.clear')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
