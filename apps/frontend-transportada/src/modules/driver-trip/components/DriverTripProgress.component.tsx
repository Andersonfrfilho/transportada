/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { DriverTrip } from '../shared/driverTrip.types'
import { computeTripProgress } from '../shared/driverTripProgress.service'
import styles from '../styles/driverTrip.module.css'

type DriverTripProgressProps = Readonly<{ trip: DriverTrip }>

/** Um segmento por parada: verde resolvida, cobre a corrente (pulsando), cinza pendente. */
export function DriverTripProgress({ trip }: DriverTripProgressProps) {
  const { t } = useTranslation('driverTrip')
  const progress = computeTripProgress(trip)

  if (progress.totalCount === 0) return null

  return (
    <div
      aria-label={t('progress.label', {
        resolved: progress.resolvedCount,
        total: progress.totalCount,
      })}
      aria-valuemax={progress.totalCount}
      aria-valuemin={0}
      aria-valuenow={progress.resolvedCount}
      className={styles.progressBar}
      role="progressbar"
    >
      {progress.segments.map((segment) => (
        <span className={styles.progressSegment} data-state={segment.state} key={segment.stopId} />
      ))}
    </div>
  )
}
