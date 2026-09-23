/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import {
  MAX_CENTIMETRES,
  toMillimetres,
} from '@/modules/nfe-workspace/shared/packageBoxMeasurementUnits.service'
import { saveArchiveFile } from '@/modules/shared/archiveDownload.service'

import { useMeasurePendingBox, packageBoxErrorCode } from '../hooks/useMeasurePendingBox.hook'
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
import {
  resolvePendingMeasurementSubmission,
  type PendingMeasurementDimensionKey,
  type PendingMeasurementDraft,
} from '../shared/tripPendingMeasurementInline.service'
import type { TripPendingMeasurement } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

import measurementStyles from './TripPendingMeasurements.module.css'

type TripPendingMeasurementsProps = Readonly<{
  measurements: readonly TripPendingMeasurement[]
}>

const DIMENSION_FIELD: Readonly<
  Record<PendingMeasurementDimensionKey, keyof typeof MAX_CENTIMETRES>
> = {
  height: 'heightMm',
  length: 'lengthMm',
  width: 'widthMm',
}

/** `YYYY-MM-DD` local, sem depender de fuso — mesmo formato que o resto do bundle usa em nome de arquivo. */
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function TripPendingMeasurements({ measurements }: TripPendingMeasurementsProps) {
  const { t } = useTranslation('trip')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  /** RF06/CA05: medir caixa é `cargo.measure` — sem ela, a tabela continua como hoje. */
  const canMeasure = permissions.includes('cargo.measure')

  const measure = useMeasurePendingBox()
  const [drafts, setDrafts] = useState<Record<string, PendingMeasurementDraft>>({})
  const [savingBoxId, setSavingBoxId] = useState<string | null>(null)
  const [errorByBoxId, setErrorByBoxId] = useState<Record<string, string>>({})
  /**
   * RF04: quem preenche precisa saber se gravou — sem isso o usuário preenchia os três campos no
   * blur e não via nada acontecer. Some assim que a linha volta a ser editada, não por tempo: um
   * `setTimeout` correria o risco de sumir antes de o operador olhar de volta para a tela.
   */
  const [savedBoxIds, setSavedBoxIds] = useState<ReadonlySet<string>>(new Set())

  if (measurements.length === 0) return null

  function handleGoToQueue() {
    navigateToPackageBoxQueue(createBrowserWorkspaceNavigator())
  }

  function draftOf(boxId: string): PendingMeasurementDraft {
    return drafts[boxId] ?? {}
  }

  function handleDimensionChange(
    measurement: TripPendingMeasurement,
    dimension: PendingMeasurementDimensionKey,
    value: string,
  ) {
    const boxId = measurement.packageBoxId
    /** Ausência é ausência: `undefined` de planta sem enriquecimento não pode virar rascunho. */
    if (boxId == null) return
    setErrorByBoxId((current) => {
      if (!(boxId in current)) return current
      const rest = { ...current }
      delete rest[boxId]
      return rest
    })
    setSavedBoxIds((current) => {
      if (!current.has(boxId)) return current
      const next = new Set(current)
      next.delete(boxId)
      return next
    })
    setDrafts((current) => ({ ...current, [boxId]: { ...current[boxId], [dimension]: value } }))
  }

  /** RF02/RF04: grava ao sair do campo, só com os três preenchidos — a linha some pela releitura. */
  function handleDimensionBlur(measurement: TripPendingMeasurement, boxId: string) {
    const submission = resolvePendingMeasurementSubmission(draftOf(boxId))
    if (!submission.ready) return

    setSavingBoxId(boxId)
    measure.mutate(
      {
        grossWeightGrams: measurement.grossWeightGrams,
        heightMm: submission.heightMm,
        id: boxId,
        lengthMm: submission.lengthMm,
        unitsPerBox: measurement.unitsPerBox ?? 1,
        widthMm: submission.widthMm,
      },
      {
        onError: (error: unknown) => {
          setSavingBoxId(null)
          setErrorByBoxId((current) => ({
            ...current,
            [boxId]: packageBoxErrorCode(error) ?? 'network',
          }))
          /** CA06: o valor digitado permanece — `drafts` nunca é limpo aqui. */
        },
        onSuccess: () => {
          setSavingBoxId(null)
          setSavedBoxIds((current) => new Set(current).add(boxId))
        },
      },
    )
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

  function dimensionCell(
    measurement: TripPendingMeasurement,
    dimension: PendingMeasurementDimensionKey,
  ) {
    const boxId = measurement.packageBoxId
    if (boxId == null) return null

    const value = draftOf(boxId)[dimension] ?? ''
    const field = DIMENSION_FIELD[dimension]
    const parsed = value.trim() === '' ? null : toMillimetres(value, field)
    const invalid = value.trim() !== '' && parsed === null
    const inputId = `pending-measurement-${boxId}-${dimension}`
    const errorId = `${inputId}-error`

    return (
      <label className={styles.measureField} htmlFor={inputId}>
        <input
          aria-describedby={invalid ? errorId : undefined}
          aria-invalid={invalid}
          disabled={savingBoxId === boxId}
          id={inputId}
          inputMode="numeric"
          onBlur={() => handleDimensionBlur(measurement, boxId)}
          onChange={(event) => handleDimensionChange(measurement, dimension, event.target.value)}
          value={value}
        />
        {invalid ? (
          <span className={styles.measureFieldError} id={errorId} role="alert">
            {t('pendingMeasurement.inline.outOfRange', { max: MAX_CENTIMETRES[field] })}
          </span>
        ) : null}
        {!invalid && savedBoxIds.has(boxId) ? (
          <span className={measurementStyles.measureFieldSaved} role="status">
            {t('pendingMeasurement.inline.saved')}
          </span>
        ) : null}
      </label>
    )
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
              {canMeasure ? (
                <>
                  <th scope="col">{t('pendingMeasurement.inline.length')}</th>
                  <th scope="col">{t('pendingMeasurement.inline.width')}</th>
                  <th scope="col">{t('pendingMeasurement.inline.height')}</th>
                </>
              ) : null}
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
                {canMeasure ? (
                  measurement.packageBoxId == null ? (
                    <td className={styles.measureFieldReason} colSpan={3}>
                      {t('pendingMeasurement.inline.noBoxReason')}
                    </td>
                  ) : (
                    <>
                      <td>{dimensionCell(measurement, 'length')}</td>
                      <td>{dimensionCell(measurement, 'width')}</td>
                      <td>{dimensionCell(measurement, 'height')}</td>
                    </>
                  )
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canMeasure && Object.keys(errorByBoxId).length > 0 ? (
        <p className={styles.measureFieldError} role="alert">
          {t('pendingMeasurement.inline.saveFailed')}
        </p>
      ) : null}
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
