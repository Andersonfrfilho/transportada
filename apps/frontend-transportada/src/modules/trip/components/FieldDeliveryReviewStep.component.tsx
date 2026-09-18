/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import { validateFieldDeliveryDeliveredAt } from '../shared/fieldDeliveryValidation.service'
import type {
  FieldDeliveryCapturedPhoto,
  FieldDeliveryDraft,
  FieldDeliveryWizardDocument,
} from '../shared/fieldDeliveryWizard.service'
import styles from '../styles/fieldDeliveryWizard.module.css'

export type FieldDeliveryReviewStepProps = Readonly<{
  capture: FieldDeliveryCapturedPhoto
  currentDocument: FieldDeliveryWizardDocument
  documents: readonly FieldDeliveryWizardDocument[]
  driverId?: string
  dispatchedAt: null | string
  onConfirm: (draft: FieldDeliveryDraft) => void
  onRetake: () => void
}>

function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Spec 156 D4/D6/D8: a conferência confirma o que a identificação sugeriu — nunca decide sozinha
 * (ADR-0067 §4). `matched` já vem com o alvo certo; `otherSelected` e `unreadable` mostram o
 * seletor para o operador confirmar ou trocar dentro do próprio lote.
 */
export function FieldDeliveryReviewStep({
  capture,
  currentDocument,
  documents,
  dispatchedAt,
  driverId,
  onConfirm,
  onRetake,
}: FieldDeliveryReviewStepProps) {
  const { t } = useTranslation('trip')
  const { identification } = capture
  const suggestedDocumentId =
    identification.status === 'matched' || identification.status === 'otherSelected'
      ? identification.documentId
      : currentDocument.documentId
  const [targetDocumentId, setTargetDocumentId] = useState(suggestedDocumentId)
  const [deliveredAt, setDeliveredAt] = useState(() => toDatetimeLocalValue(new Date()))
  const [receiverName, setReceiverName] = useState('')
  const [receiverDocument, setReceiverDocument] = useState('')
  const imageUrl = useMemo(() => URL.createObjectURL(capture.imageBlob), [capture.imageBlob])

  useEffect(() => () => URL.revokeObjectURL(imageUrl), [imageUrl])

  const deliveredAtIso = new Date(deliveredAt).toISOString()
  const deliveredAtError = validateFieldDeliveryDeliveredAt({
    deliveredAt: deliveredAtIso,
    dispatchedAt,
    now: new Date(),
  })
  /**
   * D8: assinatura é `required` a depender da configuração da empresa, que o frontend não lê hoje
   * (T6 já registra essa pendência no `evidence.md`) — por isso o nome do recebedor fica opcional
   * aqui, e a falta dele vira o 422 da API que a T12 vai tratar.
   */
  const canConfirm = deliveredAtError === undefined

  function handleConfirm(): void {
    if (!canConfirm) return
    const driverIdInput = driverId === undefined ? {} : { driverId }
    const receiverNameInput =
      receiverName.trim() === '' ? {} : { receiverName: receiverName.trim() }
    const receiverDocumentInput =
      receiverDocument.trim() === '' ? {} : { receiverDocument: receiverDocument.trim() }
    onConfirm({
      deliveredAt: deliveredAtIso,
      documentId: targetDocumentId,
      imageBlob: capture.imageBlob,
      ...driverIdInput,
      ...receiverNameInput,
      ...receiverDocumentInput,
    })
  }

  return (
    <div>
      <img
        alt={t('fieldDelivery.reviewImageAlt')}
        className={styles.reviewPreview}
        src={imageUrl}
      />

      <p className={styles.notice} role="status">
        {t(`fieldDelivery.identification.${identification.status}`)}
      </p>

      {capture.ocrSuggestion === undefined ? null : (
        <p className={styles.notice} role="status">
          <Icon aria-hidden="true" name="camera" />{' '}
          {t('fieldDelivery.ocrSuggestion', {
            document:
              documents.find((document) => document.documentId === suggestedDocumentId)
                ?.recipientName || suggestedDocumentId,
            number: capture.ocrSuggestion.number,
            series: capture.ocrSuggestion.series ?? '—',
          })}{' '}
          — {t('fieldDelivery.experimentalBadge')}
        </p>
      )}

      <label>
        {t('fieldDelivery.targetLabel')}
        <Select
          ariaLabel={t('fieldDelivery.targetLabel')}
          onChange={setTargetDocumentId}
          options={documents.map((document) => ({
            label: document.recipientName === '' ? document.documentId : document.recipientName,
            value: document.documentId,
          }))}
          value={targetDocumentId}
        />
      </label>

      <label>
        {t('fieldDelivery.deliveredAtLabel')}
        <input
          onChange={(event) => setDeliveredAt(event.target.value)}
          type="datetime-local"
          value={deliveredAt}
        />
      </label>
      {deliveredAtError === undefined ? null : (
        <p className={styles.notice} role="alert">
          {t(`fieldDelivery.deliveredAtError.${deliveredAtError}`)}
        </p>
      )}

      <label>
        {t('fieldDelivery.receiverNameLabel')}
        <input onChange={(event) => setReceiverName(event.target.value)} value={receiverName} />
      </label>

      <label>
        {t('fieldDelivery.receiverDocumentLabel')}
        <input
          onChange={(event) => setReceiverDocument(event.target.value)}
          value={receiverDocument}
        />
      </label>

      <div className={styles.captureActions}>
        <Button onClick={onRetake} type="button" variant="ghost">
          <Icon name="camera" />
          {t('fieldDelivery.retake')}
        </Button>
        <Button disabled={!canConfirm} onClick={handleConfirm} type="button">
          <Icon name="check" />
          {t('fieldDelivery.confirm')}
        </Button>
      </div>
    </div>
  )
}
