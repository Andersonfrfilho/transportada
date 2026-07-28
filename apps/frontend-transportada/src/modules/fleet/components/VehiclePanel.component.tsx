/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type {
  FleetVehicleDetail,
  FleetVehicleFilters,
  FleetVehicleRole,
  FleetVehicleStatus,
} from '../shared/fleet.types'
import { cleanFleetFilters } from '../shared/fleetFilters.service'
import type { FleetViewStatus } from '../shared/fleetViewModel.service'
import styles from '../styles/fleet.module.css'
import { FleetStatusHint } from './FleetStatusHint.component'
import { VehicleList } from './VehicleList.component'

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
        <select
          value={filters.value.roleEq ?? ''}
          onChange={(event) => patch({ roleEq: event.target.value as FleetVehicleRole })}
        >
          <option value="">{t('filterAny')}</option>
          <option value="traction">{t('roleOption.traction')}</option>
          <option value="trailer">{t('roleOption.trailer')}</option>
        </select>
      </label>
      <label>
        <span>{t('filterStatus')}</span>
        <select
          value={filters.value.statusEq ?? ''}
          onChange={(event) => patch({ statusEq: event.target.value as FleetVehicleStatus })}
        >
          <option value="">{t('filterAny')}</option>
          <option value="active">{t('status.active')}</option>
          <option value="inactive">{t('status.inactive')}</option>
        </select>
      </label>
    </div>
  )
}

export function VehiclePanel({ actions, canManageFleet, filters, view }: VehiclePanelProps) {
  const { t } = useTranslation('fleet')

  return (
    <section className={styles.panel} aria-labelledby="fleet-vehicles-title">
      <div className={styles.panelHeading}>
        <h2 id="fleet-vehicles-title">{t('vehiclesTitle')}</h2>
        {canManageFleet ? (
          <Button type="button" onClick={actions.onNew}>
            {t('newVehicle')}
          </Button>
        ) : null}
      </div>
      <VehicleFilterBar filters={filters} />
      <FleetStatusHint status={view.status} />
      {view.vehicles === undefined ? null : (
        <VehicleList
          canManageFleet={canManageFleet}
          vehicles={view.vehicles}
          onEdit={actions.onEdit}
          onToggleStatus={actions.onToggleStatus}
        />
      )}
    </section>
  )
}
