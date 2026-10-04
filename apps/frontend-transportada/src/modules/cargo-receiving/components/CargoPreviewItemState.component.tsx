/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { formatAmount } from '@/modules/shared/decimalAmount.service'

import type { CargoPreviewItem } from '../shared/cargoPreview.types'
import { resolveRowErrorKey } from '../shared/cargoPreviewItemActions.service'
import styles from '../styles/cargoPreviewDetail.module.css'
import { CargoPreviewItemStateBadge } from './CargoPreviewBadges.component'

type CargoPreviewItemStateProps = Readonly<{ item: CargoPreviewItem }>

function RowErrors({ item }: CargoPreviewItemStateProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  return (
    <ul className={styles.rowErrors}>
      {item.rowErrors.map((error) => {
        const key = resolveRowErrorKey(error.message)
        return (
          <li key={`${error.field}-${error.column}`}>
            {t('preview.item.rowError', {
              column: error.column,
              reason: key === undefined ? error.message : t(`preview.rowErrors.${key}`),
            })}
          </li>
        )
      })}
    </ul>
  )
}

function Detail({ item }: CargoPreviewItemStateProps): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  const count = item.candidateDocumentIds.length
  if (item.matchState === 'invalid') return <RowErrors item={item} />
  if (item.matchState === 'matched' && item.document !== null) {
    return (
      <span className={styles.secondary}>
        {t('preview.item.linked', {
          number: item.document.number,
          value: formatAmount(item.document.totalValue),
        })}
        {item.matchedBy === null ? '' : ` · ${t(`preview.item.decidedBy.${item.matchedBy}`)}`}
      </span>
    )
  }
  if (item.matchState === 'suggested' || item.matchState === 'ambiguous') {
    return (
      <span className={styles.secondary}>
        {t(`preview.item.candidates.${item.matchState}`, { count })}
      </span>
    )
  }
  return null
}

/** O selo da situação e o que a linha diz dela: a nota ligada, as candidatas ou o erro da planilha. */
export function CargoPreviewItemState({ item }: CargoPreviewItemStateProps): JSX.Element {
  return (
    <div className={styles.stateCell}>
      <CargoPreviewItemStateBadge state={item.matchState} />
      <Detail item={item} />
    </div>
  )
}
