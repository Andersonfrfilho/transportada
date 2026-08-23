/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'

import type { VehicleTableController } from '../hooks/useVehicleTable.hook'
import {
  readFleetVehicleColumnValue,
  type FleetVehicleColumnKey,
} from '../shared/fleetVehicleTable.service'
import type { FleetVehicleDetail } from '../shared/fleet.types'
import { formatVehicleMeasure } from '../shared/fleetVehicleMeasure.service'
import { resolveFuelArrangementLabelKey } from '../shared/fuelArrangement.service'
import { isVehicleIncompleteForMdfe } from '../shared/vehicleCompleteness.service'
import type { VehicleSortColumn } from '../shared/vehicleTable.service'
import styles from '../styles/fleet.module.css'

/** Coluna fixa da tabela: o rótulo dela não vive no menu de colunas, mas a ordenação é a mesma. */
const FIXED_COLUMN_LABEL_KEY = {
  capacityKilograms: 'columnCapacity',
  ownership: 'columnOwnership',
  plate: 'columnPlate',
  role: 'columnRole',
  status: 'columnStatus',
} as const
type FixedColumn = keyof typeof FIXED_COLUMN_LABEL_KEY

const SORT_INDICATOR = { ascending: '▲', descending: '▼', none: '' } as const

type VehicleListProps = Readonly<{
  canManageFleet: boolean
  columns: readonly FleetVehicleColumnKey[]
  onEdit: (vehicle: FleetVehicleDetail) => void
  onToggleStatus: (vehicle: FleetVehicleDetail) => void
  table: VehicleTableController
}>

export function VehicleList({
  canManageFleet,
  columns,
  onEdit,
  onToggleStatus,
  table,
}: VehicleListProps) {
  const { t } = useTranslation('fleet')

  function sortState(column: VehicleSortColumn): 'ascending' | 'descending' | 'none' {
    if (table.sort === null || table.sort.column !== column) return 'none'
    return table.sort.direction === 'asc' ? 'ascending' : 'descending'
  }

  function sortLabel(column: VehicleSortColumn): string {
    if (table.sort === null || table.sort.column !== column) return t('sort.none')
    return table.sort.direction === 'asc' ? t('sort.asc') : t('sort.desc')
  }

  function renderHeader(column: VehicleSortColumn, label: string) {
    return (
      <th aria-sort={sortState(column)} key={column} scope="col">
        <button
          className={styles.sortButton}
          onClick={() => table.toggleSort(column)}
          type="button"
        >
          {label}
          <span aria-hidden="true" className={styles.sortIndicator}>
            {SORT_INDICATOR[sortState(column)]}
          </span>
          <span className={styles.srOnly}>{sortLabel(column)}</span>
        </button>
      </th>
    )
  }

  function renderFixedHeader(column: FixedColumn) {
    return renderHeader(column, t(FIXED_COLUMN_LABEL_KEY[column]))
  }

  return (
    <div className={styles.tableScroll}>
      <table className={styles.fleetTable}>
        <thead>
          <tr>
            <th scope="col">
              <Checkbox
                ariaLabel={t('vehicleSelection.selectAll')}
                checked={table.selectionState === 'all'}
                indeterminate={table.selectionState === 'partial'}
                onChange={table.toggleAllVisible}
              />
            </th>
            {renderFixedHeader('plate')}
            {renderFixedHeader('role')}
            {renderFixedHeader('ownership')}
            {columns.map((column) => renderHeader(column, t(`columns.${column}`)))}
            {renderFixedHeader('capacityKilograms')}
            {renderFixedHeader('status')}
            {canManageFleet ? <th scope="col">{t('columnActions')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {table.vehicles.map((vehicle) => (
            <tr aria-selected={table.isSelected(vehicle.id)} key={vehicle.id}>
              <td>
                <Checkbox
                  ariaLabel={t('vehicleSelection.select', { plate: vehicle.plate })}
                  checked={table.isSelected(vehicle.id)}
                  onChange={() => table.toggleVehicle(vehicle.id)}
                />
              </td>
              <td>{vehicle.plate}</td>
              <td>{t(`roleOption.${vehicle.role}`)}</td>
              <td>{t(`ownershipOption.${vehicle.ownership}`)}</td>
              {columns.map((column) => (
                <td key={column}>
                  {readFleetVehicleColumnValue({
                    colorLabel: vehicle.color === '' ? '' : t(`colorOption.${vehicle.color}`),
                    column,
                    fuelArrangementLabel: t(resolveFuelArrangementLabelKey(vehicle)),
                    notInformedLabel: t('costNotInformed'),
                    vehicle,
                  })}
                </td>
              ))}
              <td>{formatVehicleMeasure({ unit: 'kg', value: vehicle.capacityKilograms })}</td>
              <td>
                <span
                  className={
                    vehicle.status === 'active'
                      ? `${styles.statusBadge} ${styles.statusActive}`
                      : styles.statusBadge
                  }
                >
                  {t(`status.${vehicle.status}`)}
                </span>
                {isVehicleIncompleteForMdfe(vehicle) ? (
                  <span className={styles.incompleteBadge}>{t('vehicleIncomplete')}</span>
                ) : null}
              </td>
              {canManageFleet ? (
                <td>
                  <div className={styles.rowActions}>
                    <Button size="sm" type="button" variant="ghost" onClick={() => onEdit(vehicle)}>
                      <Icon name="edit" />
                      {t('edit')}
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant={vehicle.status === 'active' ? 'ghost' : 'secondary'}
                      onClick={() => onToggleStatus(vehicle)}
                    >
                      <Icon name="power" />
                      {t(vehicle.status === 'active' ? 'deactivate' : 'activate')}
                    </Button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
