/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import { CARGO_PREVIEW_DEFAULT_LOCALE } from '../shared/cargoPreview.constant'
import type { CargoPreviewSummary } from '../shared/cargoPreview.types'
import { formatOptionalText, formatPlannedDate } from '../shared/cargoPreviewFormat.service'
import previewStyles from '../styles/cargoPreview.module.css'
import tableStyles from '../styles/cargoTable.module.css'
import { CargoPreviewSourceBadge, CargoPreviewStatusBadge } from './CargoPreviewBadges.component'

type CargoPreviewRowProps = Readonly<{
  onOpen: (previewId: string) => void
  preview: CargoPreviewSummary
}>

/** O motivo da falha sai em português; código que a tela não conhece sai genérico, nunca cru. */
function FailureReason({ errorCode }: Readonly<{ errorCode: string | null }>): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  if (errorCode === null) return null
  return (
    <span className={previewStyles.failure}>
      {t([`preview.failure.${errorCode}`, 'preview.failure.unknown'])}
    </span>
  )
}

export function CargoPreviewRow({ onOpen, preview }: CargoPreviewRowProps): JSX.Element {
  const { t, i18n } = useTranslation('cargoReceiving')
  const formatMoment = useMomentFormatter()
  const contractorName = preview.contractorName ?? t('preview.unknownContractor')

  return (
    <tr>
      <td data-label={t('preview.table.contractor')}>{contractorName}</td>
      <td data-label={t('preview.table.fileName')} className={previewStyles.fileName}>
        <div>
          <span data-file-name="">{preview.fileName}</span>
          <span className={previewStyles.sourceLine}>
            <CargoPreviewSourceBadge source={preview.source} />
          </span>
        </div>
      </td>
      <td data-label={t('preview.table.receivedAt')}>{formatMoment(preview.receivedAt)}</td>
      <td data-label={t('preview.table.plannedDate')}>
        {formatPlannedDate({
          locale: i18n.resolvedLanguage ?? CARGO_PREVIEW_DEFAULT_LOCALE,
          value: preview.plannedDate,
        })}
      </td>
      <td data-label={t('preview.table.rowCount')}>
        {preview.rowCount === null ? formatOptionalText(null) : preview.rowCount}
      </td>
      <td data-label={t('preview.table.status')}>
        <CargoPreviewStatusBadge status={preview.status} />
        {preview.status === 'failed' ? <FailureReason errorCode={preview.errorCode} /> : null}
      </td>
      <td data-label={t('table.actions')}>
        <div className={tableStyles.rowActions}>
          <Button
            aria-label={t('preview.table.openLabel', { name: contractorName })}
            onClick={() => onOpen(preview.id)}
            type="button"
            variant="ghost"
          >
            <Icon name="eye" />
            {t('table.open')}
          </Button>
        </div>
      </td>
    </tr>
  )
}
