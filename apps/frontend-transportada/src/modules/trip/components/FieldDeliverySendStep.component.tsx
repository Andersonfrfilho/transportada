/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { FieldDeliveryController } from '../hooks/useFieldDelivery.hook'
import { tripDocumentLabel } from '../shared/tripDocument.service'
import { toTripDocumentLabelSource } from '../shared/fieldDeliveryDocument.service'
import type { FieldDeliveryWizardDocument } from '../shared/fieldDeliveryWizard.service'
import { resolveTripFeedbackKey } from '../shared/tripFeedback.service'
import { FIELD_DELIVERY_FOCUS_ATTRIBUTE } from '../shared/fieldDeliveryWizardFocus.service'
import styles from '../styles/fieldDeliveryWizard.module.css'

export type FieldDeliverySendStepProps = Readonly<{
  documents: readonly FieldDeliveryWizardDocument[]
  fieldDelivery: FieldDeliveryController
  onRequestClose: () => void
}>

const STATUS_ICON: Readonly<Record<string, 'alert' | 'check' | 'clock'>> = {
  alreadySettled: 'check',
  delivered: 'check',
  failed: 'alert',
  pending: 'clock',
  sending: 'clock',
}

function statusStyle(kind: string): string {
  if (kind === 'delivered' || kind === 'alreadySettled') return styles.sendStatusDelivered ?? ''
  if (kind === 'failed') return styles.sendStatusFailed ?? ''
  return styles.sendStatusNeutral ?? ''
}

/**
 * Spec 156 T12 (aceites 5, 7, 12): a tela final do assistente — o resultado nota a nota depois do
 * envio (`useFieldDelivery`), com "tentar de novo" só para as que falharam. `documents` é a mesma
 * lista ordenada do assistente (T11); só entram aqui as que têm status (isto é, foram enviadas —
 * as puladas nunca chegam à API e não aparecem nesta tela).
 */
export function FieldDeliverySendStep({
  documents,
  fieldDelivery,
  onRequestClose,
}: FieldDeliverySendStepProps) {
  const { t } = useTranslation('trip')
  const sentDocuments = documents.filter(
    (document) => fieldDelivery.statusByDocumentId[document.documentId] !== undefined,
  )
  const statuses = Object.values(fieldDelivery.statusByDocumentId)
  const deliveredCount = statuses.filter((status) => status.kind === 'delivered').length
  const alreadySettledCount = statuses.filter((status) => status.kind === 'alreadySettled').length
  const failedCount = statuses.filter((status) => status.kind === 'failed').length
  /** M13a: só a falha transitória oferece "tentar de novo" — a terminal (400/422) precisa de
   * correção no que foi enviado, não de reenvio do mesmo corpo. */
  const retryableFailedCount = statuses.filter(
    (status) => status.kind === 'failed' && status.retryable,
  ).length

  function statusLabel(documentId: string): string {
    const status = fieldDelivery.statusByDocumentId[documentId]
    if (status === undefined || status.kind === 'pending') return t('fieldDelivery.sendPending')
    if (status.kind === 'sending') return t('fieldDelivery.sendSending')
    if (status.kind === 'delivered') return t('fieldDelivery.sendDelivered')
    if (status.kind === 'alreadySettled') return t('fieldDelivery.sendAlreadySettled')
    const feedbackKey = resolveTripFeedbackKey(new Error(status.code)) ?? 'requestFailed'
    return t(`feedback.${feedbackKey}`)
  }

  return (
    <>
      <ul aria-live="polite" className={styles.finishedList}>
        {deliveredCount > 0 ? (
          <li className={styles.notice}>
            {t('fieldDelivery.sendSummaryDelivered', { count: deliveredCount })}
          </li>
        ) : null}
        {alreadySettledCount > 0 ? (
          <li className={styles.notice}>
            {t('fieldDelivery.sendSummaryAlreadySettled', { count: alreadySettledCount })}
          </li>
        ) : null}
        {failedCount > 0 ? (
          <li className={`${styles.notice} ${styles.summaryFailed ?? ''}`} role="alert">
            {t('fieldDelivery.sendSummaryFailed', { count: failedCount })}
          </li>
        ) : null}
      </ul>

      <ul className={styles.finishedList}>
        {sentDocuments.map((document) => {
          const status = fieldDelivery.statusByDocumentId[document.documentId]
          const kind = status?.kind ?? 'pending'
          return (
            <li className={styles.finishedListItem} key={document.documentId}>
              <span className={styles.finishedDocument}>
                <span>{tripDocumentLabel(toTripDocumentLabelSource(document))}</span>
                {document.recipientName === '' ? null : (
                  <span className={styles.finishedRecipient}>{document.recipientName}</span>
                )}
              </span>
              <span className={statusStyle(kind)}>
                <Icon name={STATUS_ICON[kind] ?? 'clock'} />
                {statusLabel(document.documentId)}
              </span>
            </li>
          )
        })}
      </ul>

      <div className={styles.stepActions}>
        <Button onClick={onRequestClose} type="button" variant="secondary">
          <Icon name="close" />
          {t('fieldDelivery.close')}
        </Button>
        {retryableFailedCount > 0 && !fieldDelivery.isSubmitting ? (
          <Button
            onClick={fieldDelivery.retryFailed}
            type="button"
            {...{ [FIELD_DELIVERY_FOCUS_ATTRIBUTE]: '' }}
          >
            <Icon name="refresh" />
            {t('fieldDelivery.sendRetry', { count: retryableFailedCount })}
          </Button>
        ) : null}
      </div>
    </>
  )
}
