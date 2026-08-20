/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FilterPills, type FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'
import { FREIGHT_VEHICLE_CLASSES } from '@/modules/shared/freightClass.constant'

import type { FreightRegionTableController } from '../hooks/useFreightRegionTable.hook'
import { FREIGHT_REGION_STATUS } from '../shared/freightRegion.types'
import type { FreightRegionTableFilters } from '../shared/freightRegionTable.service'
import { toggleFilterValue } from '../shared/vehicleTable.service'
import styles from '../styles/fleet.module.css'

const SELECTION_SEPARATOR = ', '

type FreightRegionFiltersProps = Readonly<{ table: FreightRegionTableController }>

type ChipOption<TValue extends number | string> = Readonly<{
  isActive: boolean
  label: string
  value: TValue
}>

type ChipGroupProps<TValue extends number | string> = Readonly<{
  legend: string
  onToggle: (value: TValue) => void
  options: readonly ChipOption<TValue>[]
}>

function ChipGroup<TValue extends number | string>({
  legend,
  onToggle,
  options,
}: ChipGroupProps<TValue>) {
  // Cadastro sem nenhuma zona não ganha um grupo vazio ocupando linha no painel
  if (options.length === 0) return null

  return (
    <fieldset className={styles.chipGroup}>
      <legend className={styles.hint}>{legend}</legend>
      {options.map((option) => (
        <label
          className={option.isActive ? `${styles.chip} ${styles.chipActive}` : styles.chip}
          key={String(option.value)}
        >
          <Checkbox checked={option.isActive} onChange={() => onToggle(option.value)} />
          {option.label}
        </label>
      ))}
    </fieldset>
  )
}

function useFreightRegionFilterPills(table: FreightRegionTableController): readonly FilterPill[] {
  const { t } = useTranslation('fleet')

  return table.pills.map((pill) => {
    const label = t(pill.labelKey)
    const value =
      pill.valueKeys === undefined
        ? pill.value
        : pill.valueKeys.map((key) => t(key)).join(SELECTION_SEPARATOR)
    return {
      count: pill.valueKeys?.length ?? 1,
      id: pill.field,
      label,
      onRemove: () => table.clearFilterField(pill.field),
      removeLabel: t('regionFilters.removeFilter', { field: label }),
      value,
    }
  })
}

export function FreightRegionFilters({ table }: FreightRegionFiltersProps) {
  const { t } = useTranslation('fleet')
  const pills = useFreightRegionFilterPills(table)

  function patch(values: Partial<FreightRegionTableFilters>): void {
    table.setFilters({ ...table.filters, ...values })
  }

  return (
    <>
      <div className={styles.filterBar}>
        <label>
          <span>{t('regionFilters.query')}</span>
          <input
            onChange={(event) => patch({ query: event.target.value })}
            type="search"
            value={table.filters.query}
          />
        </label>
        <label>
          <span>{t('regionFilters.city')}</span>
          <input
            onChange={(event) => patch({ cityQuery: event.target.value })}
            type="search"
            value={table.filters.cityQuery}
          />
        </label>
        <p className={styles.counter}>
          {t('regionFilters.shownOfTotal', {
            shown: table.regions.length,
            total: table.totalCount,
          })}
        </p>
      </div>

      {table.isFilterPanelOpen ? (
        <div className={styles.filterPanel}>
          <ChipGroup
            legend={t('regionFilters.zone')}
            onToggle={(value) => patch({ zones: toggleFilterValue(table.filters.zones, value) })}
            options={table.filterOptions.zones.map((zone) => ({
              isActive: table.filters.zones.includes(zone),
              label: String(zone),
              value: zone,
            }))}
          />
          <ChipGroup
            legend={t('regionFilters.status')}
            onToggle={(value) =>
              patch({ statuses: toggleFilterValue(table.filters.statuses, value) })
            }
            options={FREIGHT_REGION_STATUS.map((status) => ({
              isActive: table.filters.statuses.includes(status),
              label: t(`regionStatus.${status}`),
              value: status,
            }))}
          />
          <ChipGroup
            legend={t('regionFilters.class')}
            onToggle={(value) =>
              patch({ classes: toggleFilterValue(table.filters.classes, value) })
            }
            options={FREIGHT_VEHICLE_CLASSES.map((freightClass) => ({
              isActive: table.filters.classes.includes(freightClass),
              label: t(`freightClass.${freightClass}`),
              value: freightClass,
            }))}
          />
          {table.activeFilterCount > 0 || table.sort !== null ? (
            <div className={styles.filterPanelActions}>
              <Button onClick={table.clearFilters} size="sm" type="button" variant="secondary">
                <Icon name="filter-clear" />
                {t('clearFilters')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <FilterPills
        clearAllLabel={t('clearFilters')}
        onClearAll={table.clearFilters}
        pills={pills}
      />
    </>
  )
}
