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
import { FleetEmptyState } from './FleetEmptyState.component'
import { FleetStatusHint } from './FleetStatusHint.component'
import { FleetTableSkeleton } from './FleetTableSkeleton.component'

const DRIVER_COLUMN_COUNT = 6

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

function DriverPanelBody({ actions, canManageFleet, filters, view }: DriverPanelProps) {
  const { t } = useTranslation('fleet')
  const status = view.status

  if (status === 'loading') {
    return (
      <FleetTableSkeleton
        columnCount={canManageFleet ? DRIVER_COLUMN_COUNT + 1 : DRIVER_COLUMN_COUNT}
        label={t('loading')}
      />
    )
  }
  if (status === 'error' || status === 'forbidden') return null

  const drivers = view.drivers ?? []
  if (drivers.length > 0) {
    return (
      <DriverList
        canManageFleet={canManageFleet}
        drivers={drivers}
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
        ? { action: { icon: 'add' as const, label: t('newDriver'), onAction: actions.onNew } }
        : {})}
      description={t('driversEmptyHint')}
      title={t('driversEmptyTitle')}
    />
  )
}

export function DriverPanel(props: DriverPanelProps) {
  const { t } = useTranslation('fleet')
  const { actions, canManageFleet, filters, view } = props

  return (
    <section className={styles.panel} aria-labelledby="fleet-drivers-title">
      <div className={styles.panelHeading}>
        <h2 id="fleet-drivers-title">{t('driversTitle')}</h2>
        {canManageFleet ? (
          <Button size="sm" type="button" onClick={actions.onNew}>
            <Icon name="add" />
            {t('newDriver')}
          </Button>
        ) : null}
      </div>
      <DriverFilterBar filters={filters} />
      <FleetStatusHint status={view.status} />
      <DriverPanelBody {...props} />
    </section>
  )
}
