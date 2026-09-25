/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { LocationSharingStatus } from '../shared/locationSharing.service'
import styles from '../styles/driverTrip.module.css'

type DriverLocationSharingIndicatorProps = Readonly<{
  status: LocationSharingStatus
}>

const STATUS_KEYS: Readonly<Record<Exclude<LocationSharingStatus, 'off'>, string>> = {
  sharing: 'locationSharing.indicator',
  unavailable: 'locationSharing.unavailable',
  waiting: 'locationSharing.indicator',
}

/**
 * RF15: enquanto o GPS está sendo observado para o contratante, a tela da viagem diz isso — nunca
 * rastreamento invisível. Com o GPS negado, diz que nada está subindo.
 */
export function DriverLocationSharingIndicator({ status }: DriverLocationSharingIndicatorProps) {
  const { t } = useTranslation('driverTrip')

  if (status === 'off') return null

  return (
    <p className={styles.locationIndicator} role="status">
      {t(STATUS_KEYS[status])}
    </p>
  )
}
