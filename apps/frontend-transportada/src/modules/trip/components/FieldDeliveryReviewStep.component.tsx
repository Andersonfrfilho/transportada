/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { formatTaxId, normalizeTaxId } from '@/modules/shared/taxId.service'

import {
  canAddFieldDeliveryCargoPhoto,
  FIELD_DELIVERY_CARGO_PHOTO_LIMIT,
  splitFieldDeliveryCargoPhotoSelection,
} from '../shared/fieldDeliveryCargoPhoto.service'
import {
  loadImageFromFile,
  reduceFieldDeliveryImageToJpeg,
} from '../shared/fieldDeliveryImage.service'
import {
  resolveFieldDeliveryDeliveredAtIso,
  validateFieldDeliveryDeliveredAt,
} from '../shared/fieldDeliveryValidation.service'
import {
  formatCanhotoOcrNumber,
  formatFieldDeliveryDocumentName,
  resolveFieldDeliveryIdentificationMessage,
  resolveFieldDeliveryReviewFocus,
  toFieldDeliveryTargetOption,
} from '../shared/fieldDeliveryReview.service'
import { FIELD_DELIVERY_FOCUS_ATTRIBUTE } from '../shared/fieldDeliveryWizardFocus.service'
import type {
  FieldDeliveryCapturedPhoto,
  FieldDeliveryDraft,
  FieldDeliveryWizardDocument,
} from '../shared/fieldDeliveryWizard.service'
import styles from '../styles/fieldDeliveryWizard.module.css'

/** Miniatura local de uma foto de carga já reduzida — a `previewUrl` é revogada ao remover/desmontar. */
type CargoPhotoDraft = Readonly<{ id: string; imageBlob: Blob; previewUrl: string }>

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

  /** RF7/D4: até cinco fotos da carga, reduzidas do mesmo jeito que o canhoto — entram no rascunho
   * só ao confirmar o passo (aceite CA07: 375px sem rolagem horizontal, ver o CSS do grid). */
  const [cargoPhotos, setCargoPhotos] = useState<readonly CargoPhotoDraft[]>([])
  const [isProcessingCargoPhotos, setIsProcessingCargoPhotos] = useState(false)
  const [cargoOverflow, setCargoOverflow] = useState(false)
  const cargoPhotosRef = useRef(cargoPhotos)
  cargoPhotosRef.current = cargoPhotos

  // As URLs locais das miniaturas são deste componente — revoga ao desmontar (troca de nota).
  useEffect(() => {
    return () => {
      for (const photo of cargoPhotosRef.current) URL.revokeObjectURL(photo.previewUrl)
    }
  }, [])

  async function handleCargoPhotosSelected(files: readonly File[]): Promise<void> {
    if (files.length === 0) return
    const { accepted, overflow } = splitFieldDeliveryCargoPhotoSelection({
      currentCount: cargoPhotos.length,
      selectedCount: files.length,
    })
    setCargoOverflow(overflow > 0)
    setIsProcessingCargoPhotos(true)
    try {
      const acceptedFiles = files.slice(0, accepted)
      const processed: CargoPhotoDraft[] = []
      for (const file of acceptedFiles) {
        const image = await loadImageFromFile(file)
        const imageBlob = await reduceFieldDeliveryImageToJpeg(image, {
          height: image.naturalHeight,
          width: image.naturalWidth,
        })
        processed.push({
          id: crypto.randomUUID(),
          imageBlob,
          previewUrl: URL.createObjectURL(imageBlob),
        })
      }
      setCargoPhotos((previous) => [...previous, ...processed])
    } finally {
      setIsProcessingCargoPhotos(false)
    }
  }

  function handleRemoveCargoPhoto(photoId: string): void {
    const removed = cargoPhotos.find((photo) => photo.id === photoId)
    if (removed !== undefined) URL.revokeObjectURL(removed.previewUrl)
    setCargoPhotos((previous) => previous.filter((photo) => photo.id !== photoId))
    setCargoOverflow(false)
  }

  const canAddCargoPhoto = canAddFieldDeliveryCargoPhoto(cargoPhotos.length)

  const deliveredAtIso = resolveFieldDeliveryDeliveredAtIso(deliveredAt)
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
    /** Baixos (T15): a máscara acompanha a digitação; o que sobe é a forma canônica (sem pontuação),
     * mesmo padrão de `proofFormPlan.service.ts` no lado do motorista. */
    const canonicalReceiverDocument = normalizeTaxId(receiverDocument)
    const receiverDocumentInput =
      canonicalReceiverDocument === '' ? {} : { receiverDocument: canonicalReceiverDocument }
    onConfirm({
      cargoImageBlobs: cargoPhotos.map((photo) => photo.imageBlob),
      deliveredAt: deliveredAtIso,
      documentId: targetDocumentId,
      imageBlob: capture.imageBlob,
      ...driverIdInput,
      ...receiverNameInput,
      ...receiverDocumentInput,
    })
  }

  const focusTarget = resolveFieldDeliveryReviewFocus(capture)
  const focusMarker = { [FIELD_DELIVERY_FOCUS_ATTRIBUTE]: '' }
  const suggestedDocument = documents.find(
    (document) => document.documentId === suggestedDocumentId,
  )

  return (
    /**
     * T16: `<form>` para o Enter num campo de texto confirmar a nota (o escritório digita o nome de
     * quem recebeu e segue), sem tocar no mouse. O gatilho do `Select` é `type="button"`.
     */
    <form
      className={styles.reviewStep}
      onSubmit={(event) => {
        event.preventDefault()
        handleConfirm()
      }}
    >
      <img
        alt={t('fieldDelivery.reviewImageAlt')}
        className={styles.reviewPreview}
        src={imageUrl}
      />

      <p className={styles.notice} role="status">
        {t(`fieldDelivery.identification.${resolveFieldDeliveryIdentificationMessage(capture)}`)}
      </p>

      {capture.ocrSuggestion === undefined ? null : (
        <p className={styles.noticeRow}>
          <Icon aria-hidden="true" name="camera" />
          {t('fieldDelivery.ocrSuggestion', {
            document:
              suggestedDocument === undefined
                ? ''
                : formatFieldDeliveryDocumentName(suggestedDocument),
            number: formatCanhotoOcrNumber(capture.ocrSuggestion),
          })}
          <Badge variant="secondary">{t('fieldDelivery.experimentalBadge')}</Badge>
        </p>
      )}

      <label {...(focusTarget === 'target' ? focusMarker : {})}>
        {t('fieldDelivery.targetLabel')}
        <Select
          ariaLabel={t('fieldDelivery.targetLabel')}
          onChange={setTargetDocumentId}
          options={documents.map(toFieldDeliveryTargetOption)}
          value={targetDocumentId}
        />
      </label>

      <div className={styles.reviewFields}>
        <label>
          {t('fieldDelivery.deliveredAtLabel')}
          <input
            onChange={(event) => setDeliveredAt(event.target.value)}
            type="datetime-local"
            value={deliveredAt}
          />
        </label>

        <label>
          {t('fieldDelivery.receiverNameLabel')}
          <input
            autoComplete="off"
            onChange={(event) => setReceiverName(event.target.value)}
            value={receiverName}
          />
        </label>

        <label>
          {t('fieldDelivery.receiverDocumentLabel')}
          {/* Baixos (T15): máscara de CPF/CNPJ durante a digitação (web.md §11) — nunca
              `inputMode="numeric"`, o CNPJ alfanumérico (IN RFB 2229/2024) tem letra na base. */}
          <input
            autoComplete="off"
            onChange={(event) => {
              const normalized = normalizeTaxId(event.target.value)
              setReceiverDocument(normalized === '' ? '' : formatTaxId(normalized))
            }}
            value={receiverDocument}
          />
        </label>
      </div>

      {/* RF7/D4: fotos da carga — opcional, entram no rascunho só ao confirmar. */}
      <div className={styles.cargoPhotosSection}>
        <p className={styles.cargoPhotosLabel}>
          {t('fieldDelivery.cargoPhotosLabel')}
          <span className={styles.cargoPhotosCount}>
            {t('fieldDelivery.cargoCount', {
              count: cargoPhotos.length,
              limit: FIELD_DELIVERY_CARGO_PHOTO_LIMIT,
            })}
          </span>
        </p>

        {cargoPhotos.length === 0 ? null : (
          <ul className={styles.cargoPhotosGrid}>
            {cargoPhotos.map((photo, index) => (
              <li className={styles.cargoPhotoThumb} key={photo.id}>
                <img
                  alt={t('fieldDelivery.cargoPhotosThumbAlt', { position: index + 1 })}
                  src={photo.previewUrl}
                />
                <button
                  aria-label={t('fieldDelivery.cargoPhotosRemove', { position: index + 1 })}
                  className={styles.cargoPhotoRemove}
                  onClick={() => handleRemoveCargoPhoto(photo.id)}
                  type="button"
                >
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {cargoOverflow ? (
          <p className={styles.notice} role="alert">
            {t('fieldDelivery.cargoOverflowNotice')}
          </p>
        ) : null}

        {canAddCargoPhoto ? (
          <FileField
            accept="image/*"
            actionLabel={t('fieldDelivery.cargoAdd')}
            capture="environment"
            className={styles.cargoPhotosUpload}
            disabled={isProcessingCargoPhotos}
            label={t('fieldDelivery.cargoPhotosLabel')}
            multiple
            onSelect={() => undefined}
            onSelectMany={(files) => void handleCargoPhotosSelected(files)}
            placeholder={t('fieldDelivery.uploadEmpty')}
            resetAfterSelect
          />
        ) : (
          <p className={styles.notice}>
            {t('fieldDelivery.cargoLimitReached', { limit: FIELD_DELIVERY_CARGO_PHOTO_LIMIT })}
          </p>
        )}
      </div>

      {deliveredAtError === undefined ? null : (
        <p className={styles.notice} role="alert">
          {t(`fieldDelivery.deliveredAtError.${deliveredAtError}`)}
        </p>
      )}

      <div className={styles.stepActions}>
        <Button onClick={onRetake} type="button" variant="ghost">
          <Icon name="camera" />
          {t('fieldDelivery.retake')}
        </Button>
        <Button
          disabled={!canConfirm}
          type="submit"
          {...(focusTarget === 'confirm' ? focusMarker : {})}
        >
          <Icon name="check" />
          {t('fieldDelivery.confirm')}
        </Button>
      </div>
    </form>
  )
}
