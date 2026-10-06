/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'

import type { CargoArrivalDocument } from '../shared/cargoArrival.types'
import detailStyles from '../styles/cargoDetail.module.css'
import tableStyles from '../styles/cargoTable.module.css'
import { CargoLiveTripBadge } from './CargoArrivalBadges.component'

type CargoGroupRowProps = Readonly<{
  canSelect: boolean
  document: CargoArrivalDocument
  isSelected: boolean
  onToggle: (documentId: string) => void
}>

/** Uma nota do grupo; o `data-document-id` é o endereço do atalho do resultado do lote e do fechamento. */
export function CargoGroupRow({
  canSelect,
  document,
  isSelected,
  onToggle,
}: CargoGroupRowProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')

  return (
    <tr data-document-id={document.nfeDocumentId}>
      {canSelect ? (
        <td>
          <Checkbox
            ariaLabel={t('detail.selectDocument', { number: document.number })}
            checked={isSelected}
            onChange={() => onToggle(document.nfeDocumentId)}
          />
        </td>
      ) : null}
      <td className={tableStyles.mono} data-label={t('detail.value')}>
        {t('document.number', { number: document.number })}
      </td>
      <td data-label={t('detail.recipient')}>
        {document.recipientName ?? t('document.unknownRecipient')}
      </td>
      <td data-label={t('detail.state')}>
        <span className={detailStyles.groupSummary}>
          {t(`state.${document.separationState}`)}
          {document.isInLiveTrip ? <CargoLiveTripBadge /> : null}
        </span>
      </td>
    </tr>
  )
}
