/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { FleetDriverDetail } from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'

type DriverListProps = Readonly<{
  canManageFleet: boolean
  drivers: readonly FleetDriverDetail[]
  onEdit: (driver: FleetDriverDetail) => void
  onToggleStatus: (driver: FleetDriverDetail) => void
}>

export function DriverList({ canManageFleet, drivers, onEdit, onToggleStatus }: DriverListProps) {
  const { t } = useTranslation('fleet')

  return (
    <div className={styles.tableScroll}>
      <table className={styles.fleetTable}>
        <thead>
          <tr>
            <th scope="col">{t('columnDriverName')}</th>
            <th scope="col">{t('columnTaxId')}</th>
            <th scope="col">{t('columnLicense')}</th>
            <th scope="col">{t('columnAppAccess')}</th>
            <th scope="col">{t('columnStatus')}</th>
            {canManageFleet ? <th scope="col">{t('columnActions')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {drivers.map((driver) => (
            <tr key={driver.id}>
              <td>{driver.name}</td>
              <td>{driver.taxId}</td>
              <td>{driver.licenseNumber}</td>
              <td>{t(driver.membershipId === null ? 'appAccessOff' : 'appAccessOn')}</td>
              <td>
                <span
                  className={
                    driver.status === 'active'
                      ? `${styles.statusBadge} ${styles.statusActive}`
                      : styles.statusBadge
                  }
                >
                  {t(`status.${driver.status}`)}
                </span>
              </td>
              {canManageFleet ? (
                <td>
                  <div className={styles.rowActions}>
                    <Button size="sm" type="button" variant="ghost" onClick={() => onEdit(driver)}>
                      {t('edit')}
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant={driver.status === 'active' ? 'ghost' : 'secondary'}
                      onClick={() => onToggleStatus(driver)}
                    >
                      {t(driver.status === 'active' ? 'deactivate' : 'activate')}
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
