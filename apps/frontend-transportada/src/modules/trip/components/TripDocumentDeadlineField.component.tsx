/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import type { TripDocumentDeliveryDeadline } from '../shared/trip.types'
import { formatDeliveryDeadlineDate } from '../shared/tripDeliveryDeadlineView.service'
import styles from '../styles/trip.module.css'

type TripDocumentDeadlineFieldProps = Readonly<{
  deadline: TripDocumentDeliveryDeadline
}>

/**
 * Spec 236 RF6: a data do vencimento no "Dados da nota". O estado fica no selo do cabeçalho, uma vez só — a nota
 * aberta não o repete (mesma regra da seção do comprovante, spec 233 D4).
 */
export function TripDocumentDeadlineField({ deadline }: TripDocumentDeadlineFieldProps) {
  const { i18n, t } = useTranslation('trip')

  return (
    <div className={styles.documentDataField} data-part="delivery-deadline-field">
      <dt className={styles.documentDataLabel}>{t('deliveryDeadline.field')}</dt>
      <dd className={styles.documentDataValue}>
        <span className={styles.documentDataText}>
          {formatDeliveryDeadlineDate({ language: i18n.language, value: deadline.dueOn })}
        </span>
      </dd>
    </div>
  )
}
