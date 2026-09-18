/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { saveArchiveFile } from '@/modules/shared/archiveDownload.service'

import {
  createBrowserWorkspaceNavigator,
  navigateToPackageBoxQueue,
} from '../shared/tripNavigation.service'
import {
  buildTripPendingMeasurementsCsv,
  buildTripPendingMeasurementsSheetData,
  TRIP_PENDING_MEASUREMENTS_CSV_MEDIA_TYPE,
  tripPendingMeasurementsFileName,
  type TripPendingMeasurementsExportLabels,
} from '../shared/tripPendingMeasurementsExport.service'
import type { TripPendingMeasurement } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripPendingMeasurementsProps = Readonly<{
  measurements: readonly TripPendingMeasurement[]
}>

/** `YYYY-MM-DD` local, sem depender de fuso — mesmo formato que o resto do bundle usa em nome de arquivo. */
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function TripPendingMeasurements({ measurements }: TripPendingMeasurementsProps) {
  const { t } = useTranslation('trip')

  if (measurements.length === 0) return null

  function handleGoToQueue() {
    navigateToPackageBoxQueue(createBrowserWorkspaceNavigator())
  }

  function exportLabels(): TripPendingMeasurementsExportLabels {
    return {
      emptyValue: '—',
      estimateSourceLabel: (source) => t(`pendingMeasurement.estimateSource.${source}`),
      header: {
        boxCount: t('pendingMeasurement.columns.boxCount'),
        document: t('pendingMeasurement.columns.document'),
        estimateSource: t('pendingMeasurement.columns.estimateSource'),
        product: t('pendingMeasurement.columns.product'),
        stop: t('pendingMeasurement.columns.stop'),
      },
      unknownProduct: t('pendingMeasurement.unknownProduct'),
    }
  }

  function handleExportCsv(): void {
    const csv = buildTripPendingMeasurementsCsv({ labels: exportLabels(), measurements })
    saveArchiveFile({
      blob: new Blob([csv], { type: TRIP_PENDING_MEASUREMENTS_CSV_MEDIA_TYPE }),
      fileName: tripPendingMeasurementsFileName({ extension: 'csv', today: todayIsoDate() }),
    })
  }

  async function handleExportXlsx(): Promise<void> {
    const sheetData = buildTripPendingMeasurementsSheetData({
      labels: exportLabels(),
      measurements,
    })
    const { default: writeExcelFile } = await import('write-excel-file/browser')
    const blob = await writeExcelFile(sheetData.map((row) => [...row])).toBlob()
    saveArchiveFile({
      blob,
      fileName: tripPendingMeasurementsFileName({ extension: 'xlsx', today: todayIsoDate() }),
    })
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
      <div className={styles.actions}>
        <Button onClick={handleGoToQueue} size="sm" type="button" variant="ghost">
          <Icon name="link" />
          {t('pendingMeasurement.goToQueue')}
        </Button>
        <Button
          onClick={() => {
            void handleExportXlsx()
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="download" />
          {t('pendingMeasurement.export.xlsx')}
        </Button>
        <Button onClick={handleExportCsv} size="sm" type="button" variant="ghost">
          <Icon name="download" />
          {t('pendingMeasurement.export.csv')}
        </Button>
      </div>
    </section>
  )
}
