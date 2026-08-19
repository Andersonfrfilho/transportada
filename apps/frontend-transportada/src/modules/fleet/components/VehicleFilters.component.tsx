/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FilterPills, type FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'

import type { VehicleTableController } from '../hooks/useVehicleTable.hook'
import {
  FLEET_VEHICLE_OWNERSHIP,
  FLEET_VEHICLE_ROLE,
  FLEET_VEHICLE_STATUS,
} from '../shared/fleet.types'
import { toggleFilterValue, type VehicleTableFilters } from '../shared/vehicleTable.service'
import styles from '../styles/fleet.module.css'

const SELECTION_SEPARATOR = ', '

type VehicleFiltersProps = Readonly<{ table: VehicleTableController }>

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
  // Frota sem nenhuma cor cadastrada não ganha um grupo vazio ocupando linha no painel
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

function useVehicleFilterPills(table: VehicleTableController): readonly FilterPill[] {
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
      removeLabel: t('vehicleFilters.removeFilter', { field: label }),
      value,
    }
  })
}

export function VehicleFilters({ table }: VehicleFiltersProps) {
  const { t } = useTranslation('fleet')
  const pills = useVehicleFilterPills(table)

  function patch(values: Partial<VehicleTableFilters>): void {
    table.setFilters({ ...table.filters, ...values })
  }

  return (
    <>
      <div className={styles.filterBar}>
        <label>
          <span>{t('filterPlate')}</span>
          <input
            onChange={(event) => patch({ plateQuery: event.target.value })}
            type="search"
            value={table.filters.plateQuery}
          />
        </label>
        <p className={styles.counter}>
          {t('vehicleFilters.shownOfTotal', {
            shown: table.vehicles.length,
            total: table.totalCount,
          })}
        </p>
      </div>

      {table.isFilterPanelOpen ? (
        <div className={styles.filterPanel}>
          <ChipGroup
            legend={t('vehicleFilters.role')}
            onToggle={(value) => patch({ roles: toggleFilterValue(table.filters.roles, value) })}
            options={FLEET_VEHICLE_ROLE.map((role) => ({
              isActive: table.filters.roles.includes(role),
              label: t(`roleOption.${role}`),
              value: role,
            }))}
          />
          <ChipGroup
            legend={t('vehicleFilters.status')}
            onToggle={(value) =>
              patch({ statuses: toggleFilterValue(table.filters.statuses, value) })
            }
            options={FLEET_VEHICLE_STATUS.map((status) => ({
              isActive: table.filters.statuses.includes(status),
              label: t(`status.${status}`),
              value: status,
            }))}
          />
          <ChipGroup
            legend={t('vehicleFilters.ownership')}
            onToggle={(value) =>
              patch({ ownerships: toggleFilterValue(table.filters.ownerships, value) })
            }
            options={FLEET_VEHICLE_OWNERSHIP.map((ownership) => ({
              isActive: table.filters.ownerships.includes(ownership),
              label: t(`ownershipOption.${ownership}`),
              value: ownership,
            }))}
          />
          <ChipGroup
            legend={t('vehicleFilters.brand')}
            onToggle={(value) => patch({ brands: toggleFilterValue(table.filters.brands, value) })}
            options={table.filterOptions.brands.map((brand) => ({
              isActive: table.filters.brands.includes(brand),
              label: brand,
              value: brand,
            }))}
          />
          <ChipGroup
            legend={t('vehicleFilters.color')}
            onToggle={(value) => patch({ colors: toggleFilterValue(table.filters.colors, value) })}
            options={table.filterOptions.colors.map((color) => ({
              isActive: table.filters.colors.includes(color),
              label: t(`colorOption.${color}`),
              value: color,
            }))}
          />
          <ChipGroup
            legend={t('vehicleFilters.fuelType')}
            onToggle={(value) =>
              patch({ fuelTypes: toggleFilterValue(table.filters.fuelTypes, value) })
            }
            options={table.filterOptions.fuelTypes.map((fuelType) => ({
              isActive: table.filters.fuelTypes.includes(fuelType),
              label: t(`fuelOption.${fuelType}`),
              value: fuelType,
            }))}
          />
          <ChipGroup
            legend={t('vehicleFilters.modelYear')}
            onToggle={(value) =>
              patch({ modelYears: toggleFilterValue(table.filters.modelYears, value) })
            }
            options={table.filterOptions.modelYears.map((modelYear) => ({
              isActive: table.filters.modelYears.includes(modelYear),
              label: String(modelYear),
              value: modelYear,
            }))}
          />
          <ChipGroup
            legend={t('vehicleFilters.axleCount')}
            onToggle={(value) =>
              patch({ axleCounts: toggleFilterValue(table.filters.axleCounts, value) })
            }
            options={table.filterOptions.axleCounts.map((axleCount) => ({
              isActive: table.filters.axleCounts.includes(axleCount),
              label: String(axleCount),
              value: axleCount,
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
