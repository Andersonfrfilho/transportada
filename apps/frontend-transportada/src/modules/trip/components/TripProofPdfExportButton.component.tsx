/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useTripProofPdfExport } from '../hooks/useTripProofPdfExport.hook'
import type {
  TripProofPdfFetch,
  TripProofPdfFetchRows,
  TripProofPdfSave,
} from '../shared/tripProofPdf.service'
import type { TripReportScope } from '../shared/tripReport.service'
import styles from '../styles/trip.module.css'

type TripProofPdfExportButtonProps = Readonly<{
  /** Quem desabilita diz o porquê em texto ao lado. */
  isDisabled?: boolean
  fetchPdf?: TripProofPdfFetch
  fetchRows?: TripProofPdfFetchRows
  savePdf?: TripProofPdfSave
  scope: TripReportScope
}>

/** Acima do teto da API o PDF sai em partes, com progresso e cancelamento à vista. */
export function TripProofPdfExportButton({
  isDisabled = false,
  fetchPdf,
  fetchRows,
  savePdf,
  scope,
}: TripProofPdfExportButtonProps) {
  const { t } = useTranslation('trip')
  const proofExport = useTripProofPdfExport({
    scope,
    ...(fetchPdf === undefined ? {} : { fetchPdf }),
    ...(fetchRows === undefined ? {} : { fetchRows }),
    ...(savePdf === undefined ? {} : { savePdf }),
  })

  const buttonLabel = proofExport.isExporting
    ? t('proofPdfExport.exporting')
    : t('proofPdfExport.button')

  function handleExportClick(): void {
    void proofExport.exportPdf()
  }

  function describeProgress(): string {
    const { progress } = proofExport
    if (progress === undefined || progress.phase === 'planning') {
      return t('proofPdfExport.planning')
    }
    if (progress.total === undefined || progress.total === 1) return t('proofPdfExport.exporting')
    return t('proofPdfExport.part', {
      current: Math.min(progress.completed + 1, progress.total),
      total: progress.total,
    })
  }

  function describeError(): string {
    if (proofExport.maxBlocks !== undefined) {
      return t('proofPdfExport.tooLarge', { maxBlocks: proofExport.maxBlocks })
    }
    return t(proofExport.isTooLarge ? 'proofPdfExport.tooLargeUnknown' : 'proofPdfExport.failed')
  }

  return (
    <>
      <Button
        aria-label={buttonLabel}
        aria-live="polite"
        disabled={proofExport.isExporting || isDisabled}
        onClick={handleExportClick}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Icon name="document" />
        {buttonLabel}
      </Button>
      {proofExport.isExporting ? (
        <div className={styles.proofProgress} role="status">
          <Icon name="spinner" />
          <span>{describeProgress()}</span>
          {proofExport.progress?.total === undefined ? null : (
            <progress
              aria-label={describeProgress()}
              max={proofExport.progress.total}
              value={proofExport.progress.completed}
            />
          )}
          <Button onClick={proofExport.cancelExport} size="sm" type="button" variant="secondary">
            <Icon name="close" />
            {t('proofPdfExport.cancel')}
          </Button>
        </div>
      ) : null}
      {proofExport.cancellation === undefined || proofExport.isExporting ? null : (
        <p className={styles.hint} role="status">
          {t('proofPdfExport.cancelled', { saved: proofExport.cancellation.saved })}
        </p>
      )}
      {proofExport.error === undefined ? null : (
        <p className={styles.alert} role="alert">
          {describeError()}
        </p>
      )}
    </>
  )
}
