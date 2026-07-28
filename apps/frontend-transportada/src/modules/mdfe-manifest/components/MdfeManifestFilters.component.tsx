/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { MdfeManifestTableController } from '../hooks/useMdfeManifestTable.hook'
import { MDFE_MANIFEST_STATUSES } from '../shared/mdfeManifestTable.service'
import styles from '../styles/mdfeManifest.module.css'
import { MdfeManifestAdvancedFilterBuilder } from './MdfeManifestAdvancedFilterBuilder.component'

type MdfeManifestFiltersProps = Readonly<{ table: MdfeManifestTableController }>

export function MdfeManifestFilters({ table }: MdfeManifestFiltersProps) {
  const { t } = useTranslation('mdfeManifest')

  return (
    <section className={styles.panel} aria-labelledby="mdfe-manifest-filters-title">
      <div className={styles.panelHead}>
        <h2 id="mdfe-manifest-filters-title">{t('filters.title')}</h2>
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
              {t('filters.fiscalNumber')}
              <input
                onChange={(event) =>
                  table.setTextFilter('fiscalNumberContains', event.target.value)
                }
                type="search"
                value={table.filters.fiscalNumberContains}
              />
            </label>
            <label>
              {t('filters.cteCountFrom')}
              <input
                min={0}
                onChange={(event) => table.setTextFilter('cteCountFrom', event.target.value)}
                type="number"
                value={table.filters.cteCountFrom}
              />
            </label>
            <label>
              {t('filters.cteCountTo')}
              <input
                min={0}
                onChange={(event) => table.setTextFilter('cteCountTo', event.target.value)}
                type="number"
                value={table.filters.cteCountTo}
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
            {MDFE_MANIFEST_STATUSES.map((status) => (
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
        <MdfeManifestAdvancedFilterBuilder table={table} />
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
