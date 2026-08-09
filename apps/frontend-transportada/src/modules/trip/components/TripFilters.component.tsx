/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { FilterPills, type FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { formatCalendarDate } from '@/modules/shared/calendarDate.service'

import type { TripTableController } from '../hooks/useTripTable.hook'
import { TRIP_STATUS, type TripStatus } from '../shared/trip.types'
import { describeTripFilterPills, type TripFilterPill } from '../shared/tripFilterPills.service'
import styles from '../styles/trip.module.css'

type TripFiltersProps = Readonly<{ table: TripTableController }>

export function TripFilters({ table }: TripFiltersProps) {
  const { t } = useTranslation('trip')

  const descriptors = describeTripFilterPills({
    filters: table.filters,
    formatDay: formatCalendarDate,
  })
  const pills: readonly FilterPill[] = descriptors.map(toPill)

  function toPill(descriptor: TripFilterPill): FilterPill {
    const label = t(descriptor.labelKey)
    const value = descriptor.valueKey === undefined ? descriptor.value : t(descriptor.valueKey)
    return {
      id: descriptor.field,
      label,
      onRemove: () => table.clearFilterField(descriptor.field),
      removeLabel: t('filters.removeFilter', { field: label }),
      value,
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="trip-filters-title">
      <h2 id="trip-filters-title">{t('filters.title')}</h2>

      <div className={styles.fieldGrid}>
        <label>
          {t('filters.status')}
          <Select
            ariaLabel={t('filters.status')}
            clearable
            options={TRIP_STATUS.map((status) => ({ label: t(`status.${status}`), value: status }))}
            placeholder={t('filters.all')}
            value={table.filters.statusEq ?? ''}
            onChange={(value) => table.setStatusFilter(value as '' | TripStatus)}
          />
        </label>
        <label>
          {t('filters.vehicleId')}
          <input
            onChange={(event) => table.setTextFilter('vehicleIdEq', event.target.value)}
            type="search"
            value={table.filters.vehicleIdEq ?? ''}
          />
        </label>
        <label>
          {t('filters.driverId')}
          <input
            onChange={(event) => table.setTextFilter('driverIdEq', event.target.value)}
            type="search"
            value={table.filters.driverIdEq ?? ''}
          />
        </label>
        <label>
          {t('filters.createdRange')}
          <DateRangePicker
            ariaLabel={t('filters.createdRange')}
            clearLabel={t('dateRange.clear')}
            from={table.filters.createdFrom ?? ''}
            nextMonthLabel={t('dateRange.nextMonth')}
            onChange={(from, to) => table.setDateRange(from, to)}
            placeholder={t('dateRange.placeholder')}
            previousMonthLabel={t('dateRange.previousMonth')}
            to={table.filters.createdUntil ?? ''}
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
