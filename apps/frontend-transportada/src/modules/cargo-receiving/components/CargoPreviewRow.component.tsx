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
import { CargoPreviewStatusBadge } from './CargoPreviewBadges.component'

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
      <td>{contractorName}</td>
      <td className={previewStyles.fileName}>{preview.fileName}</td>
      <td>{formatMoment(preview.receivedAt)}</td>
      <td>
        {formatPlannedDate({
          locale: i18n.resolvedLanguage ?? CARGO_PREVIEW_DEFAULT_LOCALE,
          value: preview.plannedDate,
        })}
      </td>
      <td>{preview.rowCount === null ? formatOptionalText(null) : preview.rowCount}</td>
      <td>
        <CargoPreviewStatusBadge status={preview.status} />
        {preview.status === 'failed' ? <FailureReason errorCode={preview.errorCode} /> : null}
      </td>
      <td>
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
