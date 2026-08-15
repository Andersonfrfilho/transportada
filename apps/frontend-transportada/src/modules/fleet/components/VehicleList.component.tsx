/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import {
  readFleetVehicleColumnValue,
  type FleetVehicleColumnKey,
} from '../shared/fleetVehicleTable.service'
import type { FleetVehicleDetail } from '../shared/fleet.types'
import { isVehicleIncompleteForMdfe } from '../shared/vehicleCompleteness.service'
import styles from '../styles/fleet.module.css'

type VehicleListProps = Readonly<{
  canManageFleet: boolean
  columns: readonly FleetVehicleColumnKey[]
  onEdit: (vehicle: FleetVehicleDetail) => void
  onToggleStatus: (vehicle: FleetVehicleDetail) => void
  vehicles: readonly FleetVehicleDetail[]
}>

export function VehicleList({
  canManageFleet,
  columns,
  onEdit,
  onToggleStatus,
  vehicles,
}: VehicleListProps) {
  const { t } = useTranslation('fleet')

  return (
    <div className={styles.tableScroll}>
      <table className={styles.fleetTable}>
        <thead>
          <tr>
            <th scope="col">{t('columnPlate')}</th>
            <th scope="col">{t('columnRole')}</th>
            <th scope="col">{t('columnOwnership')}</th>
            {columns.map((column) => (
              <th key={column} scope="col">
                {t(`columns.${column}`)}
              </th>
            ))}
            <th scope="col">{t('columnCapacity')}</th>
            <th scope="col">{t('columnStatus')}</th>
            {canManageFleet ? <th scope="col">{t('columnActions')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {vehicles.map((vehicle) => (
            <tr key={vehicle.id}>
              <td>{vehicle.plate}</td>
              <td>{t(`roleOption.${vehicle.role}`)}</td>
              <td>{t(`ownershipOption.${vehicle.ownership}`)}</td>
              {columns.map((column) => (
                <td key={column}>
                  {readFleetVehicleColumnValue({
                    colorLabel: vehicle.color === '' ? '' : t(`colorOption.${vehicle.color}`),
                    column,
                    notInformedLabel: t('costNotInformed'),
                    vehicle,
                  })}
                </td>
              ))}
              <td>{`${vehicle.capacityKilograms} kg`}</td>
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
