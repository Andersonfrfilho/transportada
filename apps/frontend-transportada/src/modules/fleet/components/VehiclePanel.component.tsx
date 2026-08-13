/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type {
  FleetVehicleDetail,
  FleetVehicleFilters,
  FleetVehicleRole,
  FleetVehicleStatus,
} from '../shared/fleet.types'
import { cleanFleetFilters } from '../shared/fleetFilters.service'
import type { FleetViewStatus } from '../shared/fleetViewModel.service'
import styles from '../styles/fleet.module.css'
import { FleetEmptyState } from './FleetEmptyState.component'
import { FleetStatusHint } from './FleetStatusHint.component'
import { FleetTableSkeleton } from './FleetTableSkeleton.component'
import { VehicleList } from './VehicleList.component'

const VEHICLE_COLUMN_COUNT = 5

type VehiclePanelProps = Readonly<{
  actions: Readonly<{
    onEdit: (vehicle: FleetVehicleDetail) => void
    onNew: () => void
    onToggleStatus: (vehicle: FleetVehicleDetail) => void
  }>
  canManageFleet: boolean
  filters: Readonly<{
    onChange: (value: FleetVehicleFilters) => void
    value: FleetVehicleFilters
  }>
  view: Readonly<{ status: FleetViewStatus; vehicles?: readonly FleetVehicleDetail[] }>
}>

function VehicleFilterBar({ filters }: Pick<VehiclePanelProps, 'filters'>) {
  const { t } = useTranslation('fleet')
  const patch = (values: Partial<FleetVehicleFilters>): void =>
    filters.onChange(cleanFleetFilters({ ...filters.value, ...values }))

  return (
    <div className={styles.filterBar}>
      <label>
        <span>{t('filterPlate')}</span>
        <input
          type="search"
          value={filters.value.plateContains ?? ''}
          onChange={(event) => patch({ plateContains: event.target.value })}
        />
      </label>
      <label>
        <span>{t('filterRole')}</span>
        <Select
          ariaLabel={t('filterRole')}
          clearable
          compact
          options={[
            { label: t('roleOption.traction'), value: 'traction' },
            { label: t('roleOption.trailer'), value: 'trailer' },
          ]}
          placeholder={t('filterAny')}
          value={filters.value.roleEq ?? ''}
          onChange={(value) => patch({ roleEq: value as FleetVehicleRole })}
        />
      </label>
      <label>
        <span>{t('filterStatus')}</span>
        <Select
          ariaLabel={t('filterStatus')}
          clearable
          compact
          options={[
            { label: t('status.active'), value: 'active' },
            { label: t('status.inactive'), value: 'inactive' },
          ]}
          placeholder={t('filterAny')}
          value={filters.value.statusEq ?? ''}
          onChange={(value) => patch({ statusEq: value as FleetVehicleStatus })}
        />
      </label>
    </div>
  )
}

function VehiclePanelBody({ actions, canManageFleet, filters, view }: VehiclePanelProps) {
  const { t } = useTranslation('fleet')
  const status = view.status

  if (status === 'loading') {
    return (
      <FleetTableSkeleton
        columnCount={canManageFleet ? VEHICLE_COLUMN_COUNT + 1 : VEHICLE_COLUMN_COUNT}
        label={t('loading')}
      />
    )
  }
  if (status === 'error' || status === 'forbidden') return null

  const vehicles = view.vehicles ?? []
  if (vehicles.length > 0) {
    return (
      <VehicleList
        canManageFleet={canManageFleet}
        vehicles={vehicles}
        onEdit={actions.onEdit}
        onToggleStatus={actions.onToggleStatus}
      />
    )
  }
  if (Object.keys(cleanFleetFilters(filters.value)).length > 0) {
    return (
      <FleetEmptyState
        action={{ icon: 'close', label: t('clearFilters'), onAction: () => filters.onChange({}) }}
        description={t('filtersEmptyHint')}
        title={t('filtersEmptyTitle')}
      />
    )
  }

  return (
    <FleetEmptyState
      {...(canManageFleet
        ? { action: { icon: 'add' as const, label: t('newVehicle'), onAction: actions.onNew } }
        : {})}
      description={t('vehiclesEmptyHint')}
      title={t('vehiclesEmptyTitle')}
    />
  )
}

export function VehiclePanel(props: VehiclePanelProps) {
  const { t } = useTranslation('fleet')
  const { actions, canManageFleet, filters, view } = props

  return (
    <section className={styles.panel} aria-labelledby="fleet-vehicles-title">
      <div className={styles.panelHeading}>
        <h2 id="fleet-vehicles-title">{t('vehiclesTitle')}</h2>
        {canManageFleet ? (
          <Button type="button" onClick={actions.onNew}>
            <Icon name="add" />
            {t('newVehicle')}
          </Button>
        ) : null}
      </div>
      <VehicleFilterBar filters={filters} />
      <FleetStatusHint status={view.status} />
      <VehiclePanelBody {...props} />
    </section>
  )
}
