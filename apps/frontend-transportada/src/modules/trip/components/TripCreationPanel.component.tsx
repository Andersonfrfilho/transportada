/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import type { FleetDriverDetail, FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'

import type { TripCreationController } from '../hooks/useTripCreation.hook'
import { validateTripForm } from '../shared/tripForm.service'
import styles from '../styles/trip.module.css'

type TripCreationPanelProps = Readonly<{
  creation: TripCreationController
  drivers: readonly FleetDriverDetail[]
  isCreatePending: boolean
  isReadOnly: boolean
  onCreate: () => void
  vehicles: readonly FleetVehicleDetail[]
}>

export function TripCreationPanel({
  creation,
  drivers,
  isCreatePending,
  isReadOnly,
  onCreate,
  vehicles,
}: TripCreationPanelProps) {
  const { t } = useTranslation('trip')
  const issues = validateTripForm(creation.draft)
  const activeDrivers = drivers.filter((driver) => driver.status === 'active')
  const tractionVehicles = vehicles.filter(
    (vehicle) => vehicle.status === 'active' && vehicle.role === 'traction',
  )

  if (isReadOnly) {
    return (
      <section className={styles.panel} aria-labelledby="trip-creation-title">
        <h2 id="trip-creation-title">{t('creation.title')}</h2>
        <p className={styles.hint}>{t('creation.readOnly')}</p>
      </section>
    )
  }

  return (
    <section className={styles.panel} aria-labelledby="trip-creation-title">
      <div className={styles.panelHead}>
        <h2 id="trip-creation-title">{t('creation.title')}</h2>
        <Button onClick={creation.reset} size="sm" type="button" variant="ghost">
          <Icon name="refresh" />
          {t('actions.resetCreation')}
        </Button>
      </div>

      <div className={styles.fieldGrid}>
        <label>
          {t('creation.vehicle')}
          <Select
            ariaLabel={t('creation.vehicle')}
            clearable
            options={tractionVehicles.map((vehicle) => ({
              label: `${vehicle.plate} · ${vehicle.state}`,
              value: vehicle.id,
            }))}
            placeholder={t('creation.vehiclePlaceholder')}
            value={creation.draft.vehicleId}
            onChange={creation.setVehicleId}
          />
        </label>
      </div>

      <fieldset className={styles.driverChecklist}>
        <legend className={styles.hint}>{t('creation.drivers')}</legend>
        {activeDrivers.map((driver) => (
          <Checkbox
            checked={creation.draft.driverIds.includes(driver.id)}
            key={driver.id}
            label={driver.name}
            onChange={() => creation.toggleDriver(driver.id)}
          />
        ))}
        {activeDrivers.length === 0 ? (
          <p className={styles.hint}>{t('creation.driversEmpty')}</p>
        ) : null}
      </fieldset>

      {issues.map((issue) => (
        <p className={styles.alert} key={issue}>
          {t(`formIssue.${issue}`)}
        </p>
      ))}

      <div className={styles.actionActions}>
        <Button
          disabled={issues.length > 0 || isCreatePending}
          onClick={onCreate}
          size="sm"
          type="button"
        >
          <Icon name="add" />
          {t('actions.create')}
        </Button>
      </div>
      {isCreatePending ? <p className={styles.hint}>{t('creation.pending')}</p> : null}
    </section>
  )
}
