/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { FleetVehicleDetail } from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'

type VehicleListProps = Readonly<{
  canManageFleet: boolean
  onEdit: (vehicle: FleetVehicleDetail) => void
  onToggleStatus: (vehicle: FleetVehicleDetail) => void
  vehicles: readonly FleetVehicleDetail[]
}>

export function VehicleList({
  canManageFleet,
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
              </td>
              {canManageFleet ? (
                <td>
                  <div className={styles.rowActions}>
                    <Button size="sm" type="button" variant="ghost" onClick={() => onEdit(vehicle)}>
                      {t('edit')}
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant={vehicle.status === 'active' ? 'ghost' : 'secondary'}
                      onClick={() => onToggleStatus(vehicle)}
                    >
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
