/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import {
  createBrowserWorkspaceNavigator,
  navigateToPackageBoxQueue,
} from '../shared/tripNavigation.service'
import type { TripPendingMeasurement } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripPendingMeasurementsProps = Readonly<{
  measurements: readonly TripPendingMeasurement[]
}>

export function TripPendingMeasurements({ measurements }: TripPendingMeasurementsProps) {
  const { t } = useTranslation('trip')

  if (measurements.length === 0) return null

  function handleGoToQueue() {
    navigateToPackageBoxQueue(createBrowserWorkspaceNavigator())
  }

  return (
    <section aria-labelledby="trip-pending-measurements-title" className={styles.panel}>
      <h3 id="trip-pending-measurements-title">{t('pendingMeasurement.title')}</h3>
      <div className={styles.tableScroll}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th scope="col">{t('pendingMeasurement.columns.product')}</th>
              <th scope="col">{t('pendingMeasurement.columns.document')}</th>
              <th scope="col">{t('pendingMeasurement.columns.stop')}</th>
              <th scope="col">{t('pendingMeasurement.columns.boxCount')}</th>
              <th scope="col">{t('pendingMeasurement.columns.estimateSource')}</th>
            </tr>
          </thead>
          <tbody>
            {measurements.map((measurement) => (
              <tr
                key={`${measurement.sequence}-${measurement.documentNumber ?? ''}-${measurement.productCode ?? ''}`}
              >
                <td>
                  {measurement.label ??
                    measurement.productCode ??
                    t('pendingMeasurement.unknownProduct')}
                </td>
                <td>{measurement.documentNumber ?? '—'}</td>
                <td>{measurement.stopLabel}</td>
                <td>{measurement.boxCount}</td>
                <td>{t(`pendingMeasurement.estimateSource.${measurement.estimateSource}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button onClick={handleGoToQueue} size="sm" type="button" variant="ghost">
        <Icon name="link" />
        {t('pendingMeasurement.goToQueue')}
      </Button>
    </section>
  )
}
