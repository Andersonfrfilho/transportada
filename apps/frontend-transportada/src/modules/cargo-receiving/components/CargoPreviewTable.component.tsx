/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoPreviewTableController } from '../hooks/useCargoPreviewTable.hook'
import type { CargoPreviewSummary } from '../shared/cargoPreview.types'
import { CARGO_PREVIEW_SORT_COLUMNS } from '../shared/cargoPreviewTable.service'
import previewStyles from '../styles/cargoPreview.module.css'
import tableStyles from '../styles/cargoTable.module.css'
import { CargoPreviewRow } from './CargoPreviewRow.component'
import { CargoSortHeader } from './CargoSortHeader.component'

type CargoPreviewTableProps = Readonly<{
  onOpen: (previewId: string) => void
  previews: readonly CargoPreviewSummary[]
  table: CargoPreviewTableController
}>

const COLUMN_CLASSES = [
  previewStyles.colContractor,
  previewStyles.colFile,
  previewStyles.colDate,
  previewStyles.colDate,
  previewStyles.colNumber,
  previewStyles.colStatus,
  previewStyles.colActions,
] as const

export function CargoPreviewTable({
  onOpen,
  previews,
  table,
}: CargoPreviewTableProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')

  return (
    <div
      aria-label={t('preview.table.region')}
      className={tableStyles.tableScroll}
      role="region"
      tabIndex={0}
    >
      <table className={`${tableStyles.table} ${previewStyles.previewTable}`}>
        <colgroup>
          {COLUMN_CLASSES.map((className, index) => (
            <col className={className} key={index} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {CARGO_PREVIEW_SORT_COLUMNS.map((column) => (
              <CargoSortHeader
                column={column}
                key={column}
                label={t(`preview.table.${column}`)}
                onToggle={table.toggleSort}
                sort={table.state.sort}
              />
            ))}
            <th scope="col">{t('table.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {previews.map((preview) => (
            <CargoPreviewRow key={preview.id} onOpen={onOpen} preview={preview} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
