/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CountBadge } from '@/components/ui/count-badge'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { FilterPills, type FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'
import { Tooltip } from '@/components/ui/tooltip'
import { formatCalendarDate } from '@/modules/shared/calendarDate.service'
import { useRevealedPanel } from '@/modules/shared/useRevealedPanel.hook'

import type { TripOccurrenceTableController } from '../hooks/useTripOccurrenceTable.hook'
import {
  TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES,
  TRIP_OCCURRENCE_RESOLUTION_FILTER_VALUES,
  TRIP_OCCURRENCE_STAGES,
  type TripOccurrenceResolutionFilterValue,
} from '../shared/tripOccurrenceFeed.service'
import {
  describeTripOccurrenceFilterPills,
  type TripOccurrenceFilterPill,
} from '../shared/tripOccurrenceFilterPills.service'
import { TripOccurrenceSearchField } from './TripOccurrenceSearchField.component'
import styles from '../styles/trip.module.css'

type TripOccurrenceFiltersProps = Readonly<{ table: TripOccurrenceTableController }>

/** Os campos que moram à vista (busca e chips): a tira de pílulas não os repete. */
const VISIBLE_FILTER_FIELDS: readonly string[] = ['resolutionStates']

/**
 * Spec 277 RF3: o que fica atrás do botão "Filtros avançados". O painel nasce por clique, então
 * rola e foca o primeiro campo (`useRevealedPanel`).
 */
function TripOccurrenceAdvancedFilters({ table }: TripOccurrenceFiltersProps) {
  const { t } = useTranslation('trip')
  const { panelRef } = useRevealedPanel<HTMLDivElement>()

  return (
    <div
      aria-labelledby="trip-occurrence-advanced-title"
      className={styles.occurrenceAdvanced}
      id="trip-occurrence-advanced"
      ref={panelRef}
      role="group"
    >
      <h3 id="trip-occurrence-advanced-title">{t('occurrenceFeed.filters.advanced')}</h3>
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
          {t('occurrenceFeed.filters.caseStatus')}
          <MultiSelect
            ariaLabel={t('occurrenceFeed.filters.caseStatus')}
            clearAllLabel={t('filters.clear')}
            emptyLabel={t('occurrenceFeed.filters.caseStatusEmpty')}
            onChange={(values) =>
              table.setCaseStatuses(
                TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES.filter((status) =>
                  values.includes(status),
                ),
              )
            }
            options={TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES.map((status) => ({
              label: t(`occurrenceFeed.caseStatus.${status}`),
              value: status,
            }))}
            placeholder={t('filters.all')}
            removeLabel={t('occurrenceFeed.filters.removeCaseStatus')}
            searchPlaceholder={t('occurrenceFeed.filters.caseStatusSearch')}
            summaryLabel={(count) => t('occurrenceFeed.filters.caseStatusSummary', { count })}
            values={table.filters.caseStatuses}
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

      <div className={styles.filterToggles}>
        <Tooltip label={t('occurrenceFeed.filters.contractorReplyOverdueHint')}>
          <span>
            <Checkbox
              checked={table.filters.contractorReplyOverdue}
              label={t('occurrenceFeed.filters.contractorReplyOverdue')}
              onChange={table.setContractorReplyOverdue}
            />
          </span>
        </Tooltip>
      </div>
    </div>
  )
}

export function TripOccurrenceFilters({ table }: TripOccurrenceFiltersProps) {
  const { t } = useTranslation('trip')
  const [isAdvancedOpen, setAdvancedOpen] = useState(false)

  const descriptors = describeTripOccurrenceFilterPills({
    filters: table.filters,
    formatDay: formatCalendarDate,
  }).filter((descriptor) => !VISIBLE_FILTER_FIELDS.includes(descriptor.field))
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

  function toggleResolutionState(state: TripOccurrenceResolutionFilterValue): void {
    const selected = table.filters.resolutionStates
    table.setResolutionStates(
      selected.includes(state) ? selected.filter((value) => value !== state) : [...selected, state],
    )
  }

  return (
    <section className={styles.panel} aria-labelledby="trip-occurrence-filters-title">
      <h2 className={styles.srOnly} id="trip-occurrence-filters-title">
        {t('occurrenceFeed.filters.title')}
      </h2>

      <div className={styles.occurrenceSearchRow}>
        <TripOccurrenceSearchField
          onSearch={(value) => table.setTextFilter('search', value)}
          value={table.filters.search}
        />
        <Button
          aria-controls="trip-occurrence-advanced"
          aria-expanded={isAdvancedOpen}
          onClick={() => setAdvancedOpen(!isAdvancedOpen)}
          type="button"
          variant="secondary"
        >
          <Icon name="filter" />
          {t('occurrenceFeed.filters.advanced')}
          <CountBadge count={table.advancedFilterCount} />
        </Button>
      </div>

      <div
        aria-label={t('occurrenceFeed.filters.resolution')}
        className={styles.occurrenceStateChips}
        role="group"
      >
        {TRIP_OCCURRENCE_RESOLUTION_FILTER_VALUES.map((state) => {
          const isSelected = table.filters.resolutionStates.includes(state)
          return (
            <Button
              aria-pressed={isSelected}
              key={state}
              onClick={() => toggleResolutionState(state)}
              size="sm"
              type="button"
              variant={isSelected ? 'default' : 'secondary'}
            >
              {isSelected ? <Icon name="check" /> : null}
              {t(`occurrenceResolution.state.${state}`)}
            </Button>
          )
        })}
      </div>

      {isAdvancedOpen ? <TripOccurrenceAdvancedFilters table={table} /> : null}

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
