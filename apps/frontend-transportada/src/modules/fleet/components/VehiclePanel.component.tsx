/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { CountBadge } from '@/components/ui/count-badge'
import { Icon } from '@/components/ui/icon'

import type { VehicleColumnsController } from '../hooks/useVehicleColumns.hook'
import type { VehicleTableController } from '../hooks/useVehicleTable.hook'
import type { FleetVehicleDetail } from '../shared/fleet.types'
import type { FleetViewStatus } from '../shared/fleetViewModel.service'
import styles from '../styles/fleet.module.css'
import { FleetEmptyState } from './FleetEmptyState.component'
import { FleetStatusHint } from './FleetStatusHint.component'
import { FleetTableSkeleton } from './FleetTableSkeleton.component'
import { VehicleColumnsMenu } from './VehicleColumnsMenu.component'
import { VehicleFilters } from './VehicleFilters.component'
import { VehicleList } from './VehicleList.component'
import { VehicleSelectionBar, type VehicleStatusChange } from './VehicleSelectionBar.component'

/** Seleção, placa, função, propriedade, capacidade e situação: o que a tabela mostra sempre. */
const VEHICLE_FIXED_COLUMN_COUNT = 6

type VehiclePanelProps = Readonly<{
  actions: Readonly<{
    onChangeStatus: (input: VehicleStatusChange) => void
    onEdit: (vehicle: FleetVehicleDetail) => void
    onNew: () => void
    onToggleStatus: (vehicle: FleetVehicleDetail) => void
  }>
  canManageFleet: boolean
  columns: VehicleColumnsController
  isUpdatingStatus: boolean
  table: VehicleTableController
  view: Readonly<{ status: FleetViewStatus }>
}>

function VehiclePanelBody({ actions, canManageFleet, columns, table, view }: VehiclePanelProps) {
  const { t } = useTranslation('fleet')
  const status = view.status
  const columnCount = VEHICLE_FIXED_COLUMN_COUNT + columns.visibleColumns.length

  if (status === 'loading') {
    return (
      <FleetTableSkeleton
        columnCount={canManageFleet ? columnCount + 1 : columnCount}
        label={t('loading')}
      />
    )
  }
  if (status === 'error' || status === 'forbidden') return null

  if (table.vehicles.length > 0) {
    return (
      <VehicleList
        canManageFleet={canManageFleet}
        columns={columns.visibleColumns}
        table={table}
        onEdit={actions.onEdit}
        onToggleStatus={actions.onToggleStatus}
      />
    )
  }
  if (table.totalCount > 0) {
    return (
      <FleetEmptyState
        action={{ icon: 'close', label: t('clearFilters'), onAction: table.clearFilters }}
        description={t('filtersEmptyHint')}
        title={t('filtersEmptyTitle')}
      />
    )
  }

  // O botão "Novo veículo" mora no cabeçalho do painel, logo acima — repeti-lo aqui dobra a ação
  return <FleetEmptyState description={t('vehiclesEmptyHint')} title={t('vehiclesEmptyTitle')} />
}

export function VehiclePanel(props: VehiclePanelProps) {
  const { t } = useTranslation('fleet')
  const { actions, canManageFleet, columns, isUpdatingStatus, table } = props
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false)

  return (
    <section className={styles.panel} aria-labelledby="fleet-vehicles-title">
      <div className={styles.panelHeading}>
        <h2 id="fleet-vehicles-title">{t('vehiclesTitle')}</h2>
        <div className={styles.panelActions}>
          <button
            aria-expanded={table.isFilterPanelOpen}
            aria-label={t('vehicleFilters.title')}
            className={table.isFilterPanelOpen ? styles.iconActionActive : styles.iconAction}
            title={t('vehicleFilters.title')}
            type="button"
            onClick={() => table.setFilterPanelOpen(!table.isFilterPanelOpen)}
          >
            <Icon name="filter" />
            <CountBadge count={table.activeFilterCount} />
          </button>
          <span className={styles.columnsMenuWrap}>
            <button
              aria-expanded={isColumnsMenuOpen}
              aria-label={t('columns.title')}
              className={isColumnsMenuOpen ? styles.iconActionActive : styles.iconAction}
              title={t('columns.title')}
              type="button"
              onClick={() => setIsColumnsMenuOpen(!isColumnsMenuOpen)}
            >
              <Icon name="columns" />
            </button>
            {isColumnsMenuOpen ? <VehicleColumnsMenu table={columns} /> : null}
          </span>
          {canManageFleet ? (
            <Button size="sm" type="button" onClick={actions.onNew}>
              <Icon name="add" />
              {t('newVehicle')}
            </Button>
          ) : null}
        </div>
      </div>
      <VehicleFilters table={table} />
      <VehicleSelectionBar
        canManageFleet={canManageFleet}
        isUpdatingStatus={isUpdatingStatus}
        onChangeStatus={actions.onChangeStatus}
        table={table}
      />
      <FleetStatusHint status={props.view.status} />
      <VehiclePanelBody {...props} />
    </section>
  )
}
