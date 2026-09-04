/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { FilterPills, type FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'
import { formatCalendarDate } from '@/modules/shared/calendarDate.service'

import type { TripOccurrenceTableController } from '../hooks/useTripOccurrenceTable.hook'
import { TRIP_OCCURRENCE_STAGES } from '../shared/tripOccurrenceFeed.service'
import {
  describeTripOccurrenceFilterPills,
  type TripOccurrenceFilterPill,
} from '../shared/tripOccurrenceFilterPills.service'
import styles from '../styles/trip.module.css'

type TripOccurrenceFiltersProps = Readonly<{ table: TripOccurrenceTableController }>

export function TripOccurrenceFilters({ table }: TripOccurrenceFiltersProps) {
  const { t } = useTranslation('trip')

  const descriptors = describeTripOccurrenceFilterPills({
    filters: table.filters,
    formatDay: formatCalendarDate,
  })
  const pills: readonly FilterPill[] = descriptors.map(toPill)

  function toPill(descriptor: TripOccurrenceFilterPill): FilterPill {
    const label = t(descriptor.labelKey)
    const value =
      descriptor.valueKeys === undefined
        ? descriptor.value
        : descriptor.valueKeys.map((key) => t(key)).join(', ')
    return {
      id: descriptor.field,
      label,
      onRemove: () => table.clearFilterField(descriptor.field),
      removeLabel: t('filters.removeFilter', { field: label }),
      value,
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="trip-occurrence-filters-title">
      <h2 id="trip-occurrence-filters-title">{t('occurrenceFeed.filters.title')}</h2>

      <div className={styles.fieldGrid}>
        <label>
          {t('occurrenceFeed.filters.stage')}
          <MultiSelect
            ariaLabel={t('occurrenceFeed.filters.stage')}
            clearAllLabel={t('filters.clear')}
            emptyLabel={t('occurrenceFeed.filters.stageEmpty')}
            onChange={(values) =>
              table.setStages(TRIP_OCCURRENCE_STAGES.filter((stage) => values.includes(stage)))
            }
            options={TRIP_OCCURRENCE_STAGES.map((stage) => ({
              label: t(`occurrenceFeed.stage.${stage}`),
              value: stage,
            }))}
            placeholder={t('filters.all')}
            removeLabel={t('occurrenceFeed.filters.removeStage')}
            searchPlaceholder={t('occurrenceFeed.filters.stageSearch')}
            summaryLabel={(count) => t('occurrenceFeed.filters.stageSummary', { count })}
            values={table.filters.stages}
          />
        </label>
        <label>
          {t('occurrenceFeed.filters.types')}
          <input
            onChange={(event) => table.setTextFilter('typesQuery', event.target.value)}
            placeholder={t('occurrenceFeed.filters.typesPlaceholder')}
            type="search"
            value={table.filters.typesQuery}
          />
        </label>
        <label>
          {t('occurrenceFeed.filters.plates')}
          <input
            onChange={(event) => table.setTextFilter('platesQuery', event.target.value)}
            placeholder={t('occurrenceFeed.filters.platesPlaceholder')}
            type="search"
            value={table.filters.platesQuery}
          />
        </label>
        <label>
          {t('occurrenceFeed.filters.createdRange')}
          <DateRangePicker
            ariaLabel={t('occurrenceFeed.filters.createdRange')}
            clearLabel={t('dateRange.clear')}
            from={table.filters.createdFrom}
            nextMonthLabel={t('dateRange.nextMonth')}
            onChange={(from, to) => table.setDateRange(from, to)}
            placeholder={t('dateRange.placeholder')}
            previousMonthLabel={t('dateRange.previousMonth')}
            to={table.filters.createdUntil}
          />
        </label>
      </div>

      <FilterPills
        clearAllLabel={t('filters.clear')}
        onClearAll={table.clearFilters}
        pills={pills}
      />

      <div className={styles.toolbar}>
        <p className={styles.counter}>{t('filters.active', { count: table.activeFilterCount })}</p>
        {pills.length === 0 && table.activeFilterCount > 0 ? (
          <Button onClick={table.clearFilters} size="sm" type="button" variant="secondary">
            <Icon name="filter-clear" />
            {t('filters.clear')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
