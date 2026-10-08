/** Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { saveArchiveFile } from '../archiveDownload.service'
import type {
  SpreadsheetColumn,
  SpreadsheetLegendItem,
  SpreadsheetRowInput,
} from './spreadsheetLayout.service'
import { composeLetterheadInfoLines } from './spreadsheetLetterhead.service'
import { useSpreadsheetLetterhead } from './useSpreadsheetLetterhead.hook'
import { writeBrandedSpreadsheet } from './writeBrandedSpreadsheet.service'

export type SpreadsheetExportRequest = Readonly<{
  columns: readonly SpreadsheetColumn[]
  fileName: string
  legend?: readonly SpreadsheetLegendItem[]
  rows: readonly SpreadsheetRowInput[]
  sheetName: string
  title: string
}>

/**
 * O caminho único de toda exportação em Excel: timbre da empresa (logo, nome, CNPJ, endereço),
 * título, quem e quando exportou, cabeçalho colorido e zebra. Tela nova que exporta planilha chama
 * isto e entrega só colunas e linhas — nunca monta o `.xlsx` por conta própria.
 */
export function useSpreadsheetExport(): Readonly<{
  exportSpreadsheet: (request: SpreadsheetExportRequest) => Promise<void>
}> {
  const { t } = useTranslation('spreadsheet')
  const letterhead = useSpreadsheetLetterhead()

  return {
    async exportSpreadsheet(request: SpreadsheetExportRequest): Promise<void> {
      const { company, logo, userName } = await letterhead.load()
      const blob = await writeBrandedSpreadsheet({
        columns: request.columns,
        infoLines: composeLetterheadInfoLines({
          company,
          exportedBy: t('letterhead.exportedBy', { name: userName }),
          exportedOn: t('letterhead.exportedOn', {
            date: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
          }),
          labels: { phone: t('letterhead.phone'), taxId: t('letterhead.taxId') },
        }),
        ...(request.legend === undefined ? {} : { legend: request.legend }),
        letterheadName: company.name,
        logo,
        rows: request.rows,
        sheetName: request.sheetName,
        title: request.title,
      })
      saveArchiveFile({ blob, fileName: request.fileName })
    },
  }
}
