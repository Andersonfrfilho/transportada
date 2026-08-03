/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type {
  FleetDriverDetail,
  FleetDriverFilters,
  FleetDriverStatus,
} from '../shared/fleet.types'
import { cleanFleetFilters } from '../shared/fleetFilters.service'
import type { FleetViewStatus } from '../shared/fleetViewModel.service'
import styles from '../styles/fleet.module.css'
import { DriverList } from './DriverList.component'
import { FleetStatusHint } from './FleetStatusHint.component'

type DriverPanelProps = Readonly<{
  actions: Readonly<{
    onEdit: (driver: FleetDriverDetail) => void
    onNew: () => void
    onToggleStatus: (driver: FleetDriverDetail) => void
  }>
  canManageFleet: boolean
  filters: Readonly<{
    onChange: (value: FleetDriverFilters) => void
    value: FleetDriverFilters
  }>
  view: Readonly<{ drivers?: readonly FleetDriverDetail[]; status: FleetViewStatus }>
}>

function DriverFilterBar({ filters }: Pick<DriverPanelProps, 'filters'>) {
  const { t } = useTranslation('fleet')
  const patch = (values: Partial<FleetDriverFilters>): void =>
    filters.onChange(cleanFleetFilters({ ...filters.value, ...values }))

  return (
    <div className={styles.filterBar}>
      <label>
        <span>{t('filterDriverName')}</span>
        <input
          type="search"
          value={filters.value.nameContains ?? ''}
          onChange={(event) => patch({ nameContains: event.target.value })}
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
          onChange={(value) => patch({ statusEq: value as FleetDriverStatus })}
        />
      </label>
    </div>
  )
}

export function DriverPanel({ actions, canManageFleet, filters, view }: DriverPanelProps) {
  const { t } = useTranslation('fleet')

  return (
    <section className={styles.panel} aria-labelledby="fleet-drivers-title">
      <div className={styles.panelHeading}>
        <h2 id="fleet-drivers-title">{t('driversTitle')}</h2>
        {canManageFleet ? (
          <Button type="button" onClick={actions.onNew}>
            <Icon name="add" />
            {t('newDriver')}
          </Button>
        ) : null}
      </div>
      <DriverFilterBar filters={filters} />
      <FleetStatusHint status={view.status} />
      {view.drivers === undefined ? null : (
        <DriverList
          canManageFleet={canManageFleet}
          drivers={view.drivers}
          onEdit={actions.onEdit}
          onToggleStatus={actions.onToggleStatus}
        />
      )}
    </section>
  )
}
