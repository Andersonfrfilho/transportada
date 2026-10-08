import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { FilterPills, type FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select'
import { useVehicleSelectOptions } from '@/modules/fleet/hooks/useVehicleSelectOptions.hook'
import type { FleetDriverListItem, FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'
import { formatCalendarDate } from '@/modules/shared/calendarDate.service'

import type { TripTableController } from '../hooks/useTripTable.hook'
import type { ContractorSummary } from '../shared/contractorSummary.service'
import { TRIP_STATUS } from '../shared/trip.types'
import { describeTripFilterPills, type TripFilterPill } from '../shared/tripFilterPills.service'
import { describeTripReportFilterPills } from '../shared/tripReportFilterPills.service'
import styles from '../styles/trip.module.css'
import { TripReportExportButton } from './TripReportExportButton.component'
import { TripReportFilterPanel } from './TripReportFilterPanel.component'

function labelOf(options: readonly MultiSelectOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value
}

type TripFiltersProps = Readonly<{
  contractors: readonly ContractorSummary[]
  drivers: readonly FleetDriverListItem[]
  table: TripTableController
  vehicles: readonly FleetVehicleDetail[]
}>

/**
 * Veículo e motorista eram caixas de texto esperando o UUID do cadastro — ninguém decora um, e
 * digitar errado devolvia lista vazia sem dizer por quê. Os três filtros escolhem do catálogo, e
 * escolhem mais de um: "quais viagens destes dois caminhões estão em rota" é uma pergunta só.
 *
 * O catálogo é o cadastro **inteiro**, não só o ativo: filtrar viagem antiga exige o veículo que
 * saiu da frota depois dela.
 */
export function TripFilters({ contractors, drivers, table, vehicles }: TripFiltersProps) {
  const { t } = useTranslation('trip')

  const vehicleOptions = useVehicleSelectOptions(vehicles)
  const driverOptions: readonly MultiSelectOption[] = drivers.map((driver) => ({
    label: driver.name,
    value: driver.id,
  }))

  const descriptors = describeTripFilterPills({
    describeDriver: (driverId) => labelOf(driverOptions, driverId),
    describeVehicle: (vehicleId) => labelOf(vehicleOptions, vehicleId),
    filters: table.filters,
    formatDay: formatCalendarDate,
  })
  const reportDescriptors = describeTripReportFilterPills({
    describeContractor: (contractorId) =>
      contractors.find((contractor) => contractor.id === contractorId)?.displayName ?? contractorId,
    noContractorLabel: t('filters.report.noContractor'),
    state: table.reportFilters.state,
  })
  const pills: readonly FilterPill[] = descriptors.map(toPill)
  const reportPills: readonly FilterPill[] = reportDescriptors.map((descriptor) => {
    const label = t(descriptor.labelKey)
    const value =
      descriptor.valueKeys === undefined
        ? descriptor.value
        : descriptor.valueKeys.map((key) => t(key)).join(', ')
    return {
      id: `report-${descriptor.field}`,
      label,
      onRemove: () => table.reportFilters.clearField(descriptor.field),
      removeLabel: t('filters.removeFilter', { field: label }),
      value,
    }
  })
  const allPills: readonly FilterPill[] = [...pills, ...reportPills]

  function toPill(descriptor: TripFilterPill): FilterPill {
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
    <section className={styles.panel} aria-labelledby="trip-filters-title">
      <h2 id="trip-filters-title">{t('filters.title')}</h2>

      <div className={styles.fieldGrid}>
        <label>
          {t('filters.status')}
          <MultiSelect
            ariaLabel={t('filters.status')}
            clearAllLabel={t('filters.statusClearAll')}
            emptyLabel={t('filters.statusEmpty')}
            onChange={(values) =>
              table.setStatusFilter(TRIP_STATUS.filter((status) => values.includes(status)))
            }
            options={TRIP_STATUS.map((status) => ({
              label: t(`status.${status}`),
              value: status,
            }))}
            placeholder={t('filters.all')}
            removeLabel={t('filters.removeStatus')}
            searchPlaceholder={t('filters.statusSearch')}
            summaryLabel={(count) => t('filters.statusSummary', { count })}
            values={table.filters.statusIn ?? []}
          />
        </label>
        <label>
          {t('filters.vehicleId')}
          <MultiSelect
            ariaLabel={t('filters.vehicleId')}
            clearAllLabel={t('filters.vehicleClearAll')}
            emptyLabel={t('filters.vehicleEmpty')}
            onChange={(values) => table.setIdFilter('vehicleIdIn', values)}
            options={vehicleOptions}
            placeholder={t('filters.allMasculine')}
            removeLabel={t('filters.removeVehicle')}
            searchPlaceholder={t('filters.vehicleSearch')}
            summaryLabel={(count) => t('filters.vehicleSummary', { count })}
            values={table.filters.vehicleIdIn ?? []}
          />
        </label>
        <label>
          {t('filters.driverId')}
          <MultiSelect
            ariaLabel={t('filters.driverId')}
            clearAllLabel={t('filters.driverClearAll')}
            emptyLabel={t('filters.driverEmpty')}
            onChange={(values) => table.setIdFilter('driverIdIn', values)}
            options={driverOptions}
            placeholder={t('filters.allMasculine')}
            removeLabel={t('filters.removeDriver')}
            searchPlaceholder={t('filters.driverSearch')}
            summaryLabel={(count) => t('filters.driverSummary', { count })}
            values={table.filters.driverIdIn ?? []}
          />
        </label>
        <Checkbox
          checked={table.filters.proofPendingEq === true}
          label={t('filters.proofPendingOnly')}
          onChange={table.setProofPendingFilter}
        />
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

      <TripReportFilterPanel contractors={contractors} filters={table.reportFilters} />
      <div className={styles.reportExportBar}>
        <TripReportExportButton scope={{ filters: table.reportScope }} />
      </div>

      <FilterPills
        clearAllLabel={t('filters.clear')}
        onClearAll={table.clearFilters}
        pills={allPills}
      />

      <div className={styles.toolbar}>
        <p className={styles.counter}>{t('filters.active', { count: table.activeFilterCount })}</p>
        {allPills.length === 0 && table.activeFilterCount > 0 ? (
          <Button onClick={table.clearFilters} size="sm" type="button" variant="secondary">
            <Icon name="filter-clear" />
            {t('filters.clear')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
