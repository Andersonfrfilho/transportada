/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  /** Mais de uma linha pode estar gravando ao mesmo tempo — a ação em massa dispara várias. */
  const [savingBoxIds, setSavingBoxIds] = useState<ReadonlySet<string>>(new Set())
  const [errorByBoxId, setErrorByBoxId] = useState<Record<string, string>>({})
  /**
   * RF04: quem preenche precisa saber se gravou — sem isso o usuário preenchia os três campos e
   * não via nada acontecer. Some assim que a linha volta a ser editada, não por tempo: um
   * `setTimeout` correria o risco de sumir antes de o operador olhar de volta para a tela.
   */
  const [savedBoxIds, setSavedBoxIds] = useState<ReadonlySet<string>>(new Set())
  /** O usuário pediu "uma seleção para gravar todos" — marca linhas para a ação em massa. */
  const [selectedBoxIds, setSelectedBoxIds] = useState<ReadonlySet<string>>(new Set())

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

  /**
   * O salvamento automático saiu (RF novo): o operador reclamou que preenchia os três campos e não
   * via nada acontecer. Agora é sempre um clique explícito — o botão da linha ou a ação em massa —,
   * só com os três valores preenchidos e dentro da faixa; a linha some pela releitura.
   */
  function handleSaveBox(measurement: TripPendingMeasurement, boxId: string) {
    const submission = resolvePendingMeasurementSubmission(draftOf(boxId))
    if (!submission.ready) return

    setSavingBoxIds((current) => new Set(current).add(boxId))
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
          setSavingBoxIds((current) => {
            const next = new Set(current)
            next.delete(boxId)
            return next
          })
          setErrorByBoxId((current) => ({
            ...current,
            [boxId]: packageBoxErrorCode(error) ?? 'network',
          }))
          /** CA06: o valor digitado permanece — `drafts` nunca é limpo aqui. */
        },
        onSuccess: () => {
          setSavingBoxIds((current) => {
            const next = new Set(current)
            next.delete(boxId)
            return next
          })
          setSavedBoxIds((current) => new Set(current).add(boxId))
          setSelectedBoxIds((current) => {
            if (!current.has(boxId)) return current
            const next = new Set(current)
            next.delete(boxId)
            return next
          })
        },
      },
    )
  }

  function handleToggleRowSelection(boxId: string, checked: boolean) {
    setSelectedBoxIds((current) => {
      const next = new Set(current)
      if (checked) next.add(boxId)
      else next.delete(boxId)
      return next
    })
  }

  function handleToggleSelectAll(checked: boolean, selectableBoxIds: readonly string[]) {
    setSelectedBoxIds(checked ? new Set(selectableBoxIds) : new Set())
  }

  /**
   * A seleção ignora linha sem caixa (nunca entra nela, não tem checkbox) e linha sem os três
   * valores prontos — grava só o que está pronto, e diz quanto ficou de fora (mesmo espírito do
   * aviso em `TripStateActions.component.tsx`).
   */
  function handleSaveSelected(byBoxId: ReadonlyMap<string, TripPendingMeasurement>) {
    for (const boxId of selectedBoxIds) {
      const measurement = byBoxId.get(boxId)
      if (measurement === undefined) continue
      if (!resolvePendingMeasurementSubmission(draftOf(boxId)).ready) continue
      handleSaveBox(measurement, boxId)
    }
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
          disabled={savingBoxIds.has(boxId)}
          id={inputId}
          inputMode="numeric"
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

  function measurableRowCells(measurement: TripPendingMeasurement, boxId: string) {
    const rowReady = resolvePendingMeasurementSubmission(draftOf(boxId)).ready

    return (
      <>
        <td className={measurementStyles.selectionCell}>
          <Checkbox
            ariaLabel={t('pendingMeasurement.inline.selectRow')}
            checked={selectedBoxIds.has(boxId)}
            disabled={savingBoxIds.has(boxId)}
            onChange={(checked) => handleToggleRowSelection(boxId, checked)}
          />
        </td>
        <td>{dimensionCell(measurement, 'length')}</td>
        <td>{dimensionCell(measurement, 'width')}</td>
        <td>{dimensionCell(measurement, 'height')}</td>
        <td>
          {rowReady ? (
            <Button
              className={measurementStyles.rowSaveButton}
              disabled={savingBoxIds.has(boxId)}
              onClick={() => handleSaveBox(measurement, boxId)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="save" />
              {t('pendingMeasurement.inline.saveRow')}
            </Button>
          ) : null}
        </td>
      </>
    )
  }

  const byBoxId = new Map(
    measurements
      .filter((measurement) => measurement.packageBoxId != null)
      .map((measurement) => [measurement.packageBoxId as string, measurement] as const),
  )
  const selectableBoxIds = [...byBoxId.keys()]
  const readySelection = [...selectedBoxIds].filter(
    (boxId) => byBoxId.has(boxId) && resolvePendingMeasurementSubmission(draftOf(boxId)).ready,
  )
  const excludedSelectionCount = selectedBoxIds.size - readySelection.length
  const allSelectableSelected =
    selectableBoxIds.length > 0 && selectableBoxIds.every((boxId) => selectedBoxIds.has(boxId))
  const someSelected = selectedBoxIds.size > 0 && !allSelectableSelected

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
                  <th className={measurementStyles.selectionCell} scope="col">
                    {selectableBoxIds.length > 0 ? (
                      <Checkbox
                        ariaLabel={t('pendingMeasurement.inline.selectAll')}
                        checked={allSelectableSelected}
                        indeterminate={someSelected}
                        onChange={(checked) => handleToggleSelectAll(checked, selectableBoxIds)}
                      />
                    ) : null}
                  </th>
                  <th scope="col">{t('pendingMeasurement.inline.length')}</th>
                  <th scope="col">{t('pendingMeasurement.inline.width')}</th>
                  <th scope="col">{t('pendingMeasurement.inline.height')}</th>
                  <th scope="col">{t('pendingMeasurement.inline.saveRow')}</th>
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
                    <td className={styles.measureFieldReason} colSpan={5}>
                      {t('pendingMeasurement.inline.noBoxReason')}
                    </td>
                  ) : (
                    measurableRowCells(measurement, measurement.packageBoxId)
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
      {canMeasure && excludedSelectionCount > 0 ? (
        <p className={styles.hint} role="status">
          {t('pendingMeasurement.inline.selectionExcluded', { count: excludedSelectionCount })}
        </p>
      ) : null}
      <div className={styles.actions}>
        {canMeasure && selectedBoxIds.size > 0 ? (
          <Button
            disabled={readySelection.length === 0}
            onClick={() => handleSaveSelected(byBoxId)}
            size="sm"
            type="button"
          >
            <Icon name="save" />
            {t('pendingMeasurement.inline.saveSelected', { count: readySelection.length })}
          </Button>
        ) : null}
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
