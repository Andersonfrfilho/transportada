/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useSpreadsheetExport } from '@/modules/shared/spreadsheet/useSpreadsheetExport.hook'

import { useTripReportExport } from '../hooks/useTripReportExport.hook'
import type { TripReportScope } from '../shared/tripReport.service'
import type { TripReportFetchPage, TripReportResult } from '../shared/tripReport.types'
import { buildTripReportRows } from '../shared/tripReportRows.service'
import styles from '../styles/trip.module.css'

const REPORT_LOCALE = 'pt-BR'
const REPORT_FILE_NAME = 'trip-report.xlsx'

type TripReportExportButtonProps = Readonly<{
  /** Quem desabilita diz o porquê em texto ao lado. */
  isDisabled?: boolean
  fetchPage?: TripReportFetchPage
  /** Depois da planilha salva; a aba de notas lê `excludedWithoutTrip` daqui para avisar. */
  onExported?: (result: TripReportResult) => void
  scope: TripReportScope
}>

/** Botão autocontido: escopo entra, planilha timbrada sai. Seleção, filtro e aba de notas só escolhem o `scope`. */
export function TripReportExportButton({
  isDisabled = false,
  fetchPage,
  onExported,
  scope,
}: TripReportExportButtonProps) {
  const { t } = useTranslation('trip')
  const spreadsheetExport = useSpreadsheetExport()
  const reportExport = useTripReportExport({
    buildSpreadsheet: async (result: TripReportResult) => {
      const sheet = buildTripReportRows({
        locale: REPORT_LOCALE,
        rows: result.rows,
        translate: (key) => t(key),
      })
      await spreadsheetExport.exportSpreadsheet({
        ...sheet,
        fileName: REPORT_FILE_NAME,
        sheetName: t('reportExport.sheetName'),
        title: t('reportExport.title'),
      })
      onExported?.(result)
    },
    ...(fetchPage === undefined ? {} : { fetchPage }),
    scope,
  })

  function describeLabel(): string {
    const { progress } = reportExport
    if (progress === undefined) return t('reportExport.button')
    if (progress.total === undefined) {
      return t('reportExport.exportingUnknown', { loaded: progress.loaded })
    }
    return t('reportExport.exporting', { loaded: progress.loaded, total: progress.total })
  }

  function handleExportClick(): void {
    void reportExport.exportReport()
  }

  return (
    <>
      <Button
        aria-label={describeLabel()}
        aria-live="polite"
        disabled={reportExport.isExporting || isDisabled}
        onClick={handleExportClick}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Icon name="download" />
        {describeLabel()}
      </Button>
      {reportExport.error === undefined ? null : (
        <p className={styles.alert} role="alert">
          {reportExport.maxRows === undefined
            ? t(reportExport.isTooLarge ? 'reportExport.tooLargeUnknown' : 'reportExport.failed')
            : t('reportExport.tooLarge', { maxRows: reportExport.maxRows })}
        </p>
      )}
    </>
  )
}
