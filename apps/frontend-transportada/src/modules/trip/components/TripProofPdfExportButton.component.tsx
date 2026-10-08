/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useTripProofPdfExport } from '../hooks/useTripProofPdfExport.hook'
import {
  isTripProofPdfScopeTooBroad,
  TRIP_PROOF_PDF_MAX_DOCUMENT_IDS,
  type TripProofPdfFetch,
  type TripProofPdfSave,
} from '../shared/tripProofPdf.service'
import type { TripReportScope } from '../shared/tripReport.service'
import styles from '../styles/trip.module.css'

type TripProofPdfExportButtonProps = Readonly<{
  /** Quem desabilita diz o porquê em texto ao lado. */
  isDisabled?: boolean
  fetchPdf?: TripProofPdfFetch
  savePdf?: TripProofPdfSave
  scope: TripReportScope
}>

/** Um PDF por pedido: seleção de notas acima do teto da API desabilita o botão em vez de dividir em vários arquivos. */
export function TripProofPdfExportButton({
  isDisabled = false,
  fetchPdf,
  savePdf,
  scope,
}: TripProofPdfExportButtonProps) {
  const { t } = useTranslation('trip')
  const proofExport = useTripProofPdfExport({
    scope,
    ...(fetchPdf === undefined ? {} : { fetchPdf }),
    ...(savePdf === undefined ? {} : { savePdf }),
  })
  const isTooBroad = isTripProofPdfScopeTooBroad(scope)

  const buttonLabel = proofExport.isExporting
    ? t('proofPdfExport.exporting')
    : t('proofPdfExport.button')

  function handleExportClick(): void {
    void proofExport.exportPdf()
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
        disabled={proofExport.isExporting || isTooBroad || isDisabled}
        onClick={handleExportClick}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Icon name="document" />
        {buttonLabel}
      </Button>
      {isTooBroad ? (
        <p className={styles.alert} role="status">
          {t('proofPdfExport.tooManyDocuments', { max: TRIP_PROOF_PDF_MAX_DOCUMENT_IDS })}
        </p>
      ) : null}
      {proofExport.error === undefined ? null : (
        <p className={styles.alert} role="alert">
          {describeError()}
        </p>
      )}
    </>
  )
}
