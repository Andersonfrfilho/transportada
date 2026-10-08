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
  fetchPdf?: TripProofPdfFetch
  savePdf?: TripProofPdfSave
  scope: TripReportScope
}>

/** Um PDF por pedido: seleção de notas acima do teto da API desabilita o botão em vez de dividir em vários arquivos. */
export function TripProofPdfExportButton({
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
        aria-label={t('proofPdfExport.button')}
        disabled={proofExport.isExporting || isTooBroad}
        onClick={handleExportClick}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Icon name="document" />
        {proofExport.isExporting ? t('proofPdfExport.exporting') : t('proofPdfExport.button')}
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
