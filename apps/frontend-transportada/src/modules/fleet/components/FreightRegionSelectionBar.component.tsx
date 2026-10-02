/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { COPY_FEEDBACK_MILLISECONDS } from '@/modules/shared/clipboard.constant'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useSpreadsheetExport } from '@/modules/shared/spreadsheet/useSpreadsheetExport.hook'
import { saveArchiveFile } from '@/modules/shared/archiveDownload.service'

import type { FreightRegionTableController } from '../hooks/useFreightRegionTable.hook'
import {
  buildFreightRegionCityList,
  buildFreightRegionCsv,
  FREIGHT_REGION_EXPORT_COLUMNS,
  buildFreightRegionExportColumns,
  buildFreightRegionRows,
  FREIGHT_REGION_EXPORT_EXCEL_FILE_NAME,
  FREIGHT_REGION_EXPORT_FILE_NAME,
  FREIGHT_REGION_EXPORT_MEDIA_TYPE,
  type FreightRegionExportColumn,
} from '../shared/freightRegionExport.service'
import styles from '../styles/fleet.module.css'

type FreightRegionSelectionBarProps = Readonly<{ table: FreightRegionTableController }>

export function FreightRegionSelectionBar({ table }: FreightRegionSelectionBarProps) {
  const { t } = useTranslation('fleet')
  const spreadsheetExport = useSpreadsheetExport()
  const [hasCopiedCities, setHasCopiedCities] = useState(false)

  const selected = table.selectedRegions
  if (selected.length === 0) return null

  async function exportExcel(): Promise<void> {
    await spreadsheetExport.exportSpreadsheet({
      columns: buildFreightRegionExportColumns(regionHeader()),
      fileName: FREIGHT_REGION_EXPORT_EXCEL_FILE_NAME,
      rows: buildFreightRegionRows(selected),
      sheetName: t('regionSelection.sheetName'),
      title: t('regionSelection.title'),
    })
  }

  function regionHeader(): Record<FreightRegionExportColumn, string> {
    return Object.fromEntries(
      FREIGHT_REGION_EXPORT_COLUMNS.map((column) => [column, t(`regionColumns.${column}`)]),
    ) as Record<FreightRegionExportColumn, string>
  }

  function exportSelection(): void {
    const csv = buildFreightRegionCsv({
      header: regionHeader(),
      regions: selected,
    })

    saveArchiveFile({
      blob: new Blob([csv], { type: FREIGHT_REGION_EXPORT_MEDIA_TYPE }),
      fileName: FREIGHT_REGION_EXPORT_FILE_NAME,
    })
  }

  /** Uma cidade por linha é o que o operador cola na conversa com o motorista da viagem. */
  async function copyCities(): Promise<void> {
    try {
      await navigator.clipboard.writeText(buildFreightRegionCityList(selected))
      setHasCopiedCities(true)
      window.setTimeout(() => setHasCopiedCities(false), COPY_FEEDBACK_MILLISECONDS)
    } catch {
      setHasCopiedCities(false)
    }
  }

  return (
    <div className={styles.bulkBar}>
      <p className={styles.counter}>{t('regionSelection.count', { count: selected.length })}</p>
      <div className={styles.bulkActions}>
        <Button
          onClick={() => {
            void exportExcel()
          }}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="export" />
          {t('regionSelection.exportExcel', { count: selected.length })}
        </Button>
        <Button onClick={exportSelection} size="sm" type="button" variant="secondary">
          <Icon name="export" />
          {t('regionSelection.export', { count: selected.length })}
        </Button>
        <Button
          onClick={() => {
            void copyCities()
          }}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name={hasCopiedCities ? 'check' : 'copy'} />
          {hasCopiedCities
            ? t('regionSelection.copied')
            : t('regionSelection.copyCities', { count: selected.length })}
        </Button>
        <Button onClick={table.clearSelection} size="sm" type="button" variant="ghost">
          <Icon name="close" />
          {t('regionSelection.clear')}
        </Button>
      </div>
    </div>
  )
}
