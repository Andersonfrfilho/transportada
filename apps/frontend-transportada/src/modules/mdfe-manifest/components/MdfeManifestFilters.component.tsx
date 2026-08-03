/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { FilterPills, type FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'
import { formatCalendarDate } from '@/modules/shared/calendarDate.service'
import { SELECTION_SEPARATOR } from '@/modules/shared/filterPill.service'

import type { MdfeManifestTableController } from '../hooks/useMdfeManifestTable.hook'
import {
  describeMdfeManifestFilterPills,
  type MdfeManifestFilterPill,
} from '../shared/mdfeManifestFilterPills.service'
import { MDFE_MANIFEST_STATUSES } from '../shared/mdfeManifestTable.service'
import styles from '../styles/mdfeManifest.module.css'
import { MdfeManifestAdvancedFilterBuilder } from './MdfeManifestAdvancedFilterBuilder.component'

type MdfeManifestFiltersProps = Readonly<{ table: MdfeManifestTableController }>

export function MdfeManifestFilters({ table }: MdfeManifestFiltersProps) {
  const { t } = useTranslation('mdfeManifest')

  // No modo avançado quem conta é o construtor de condições: as pílulas descrevem só o filtro simples.
  const descriptors =
    table.filterMode === 'advanced'
      ? []
      : describeMdfeManifestFilterPills({ filters: table.filters, formatDay: formatCalendarDate })
  const pills: readonly FilterPill[] = descriptors.map(toPill)

  function toPill(descriptor: MdfeManifestFilterPill): FilterPill {
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
              {t('filters.createdRange')}
              <DateRangePicker
                ariaLabel={t('filters.createdRange')}
                clearLabel={t('dateRange.clear')}
                from={table.filters.createdFrom}
                nextMonthLabel={t('dateRange.nextMonth')}
                onChange={(from, to) => {
                  table.setTextFilter('createdFrom', from)
                  table.setTextFilter('createdTo', to)
                }}
                placeholder={t('dateRange.placeholder')}
                previousMonthLabel={t('dateRange.previousMonth')}
                to={table.filters.createdTo}
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
                <Checkbox
                  checked={table.filters.statuses.includes(status)}
                  onChange={() => table.toggleStatus(status)}
                />
                {t(`status.${status}`)}
              </label>
            ))}
          </fieldset>
        </>
      ) : (
        <MdfeManifestAdvancedFilterBuilder table={table} />
      )}

      <FilterPills
        clearAllLabel={t('filters.clear')}
        onClearAll={table.clearFilters}
        pills={pills}
      />

      <div className={styles.toolbar}>
        <p className={styles.counter}>{t('filters.active', { count: table.activeFilterCount })}</p>
        {/* Com pílulas na tela o "limpar tudo" já está nelas: o botão só cobre o que elas não descrevem. */}
        {pills.length === 0 && (table.activeFilterCount > 0 || table.sort !== null) ? (
          <Button onClick={table.clearFilters} size="sm" type="button" variant="secondary">
            <Icon name="filter-clear" />
            {t('filters.clear')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
