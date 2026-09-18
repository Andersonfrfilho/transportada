/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { tripDocumentLabel } from '../shared/tripDocument.service'
import { toTripDocumentLabelSource } from '../shared/fieldDeliveryDocument.service'
import type { FieldDeliveryWizardDocument } from '../shared/fieldDeliveryWizard.service'
import styles from '../styles/fieldDeliveryWizard.module.css'

export type FieldDeliveryNoteBannerProps = Readonly<{
  document: FieldDeliveryWizardDocument
  stepIndex: number
  totalSteps: number
}>

/**
 * Spec 156 D5: a faixa por cima da câmera — número/série, destinatário e cidade. Nunca CPF nem
 * outro dado sensível (security.md §1): só o que já aparece em qualquer listagem de entrega.
 */
export function FieldDeliveryNoteBanner({
  document,
  stepIndex,
  totalSteps,
}: FieldDeliveryNoteBannerProps) {
  const { t } = useTranslation('trip')

  return (
    <div className={styles.banner} role="status">
      <span className={styles.bannerProgress}>
        {t('fieldDelivery.stepProgress', { current: stepIndex + 1, total: totalSteps })}
      </span>
      <strong className={styles.bannerDocument}>
        {tripDocumentLabel(toTripDocumentLabelSource(document))}
      </strong>
      <span className={styles.bannerRecipient}>
        {document.recipientName === ''
          ? t('fieldDelivery.recipientUnknown')
          : document.recipientName}
      </span>
      {document.city === '' ? null : <span className={styles.bannerCity}>{document.city}</span>}
    </div>
  )
}
