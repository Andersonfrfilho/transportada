/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { Icon } from '@/components/ui/icon'

import { useCameraCaptureFieldRef } from '../hooks/useCameraCaptureFieldRef.hook'
import {
  useStopOccurrenceForm,
  type StopOccurrenceDraft,
} from '../hooks/useStopOccurrenceForm.hook'
import { DRIVER_OCCURRENCE_KINDS, type DriverTripStop } from '../shared/driverTrip.types'
import { findOccurrencePhotoDocument } from '../shared/driverTripView.service'
import { renderOccurrenceNoticePreview } from '../shared/occurrenceNoticePreview.service'
import styles from '../styles/driverTrip.module.css'

type DriverStopOccurrenceFormProps = Readonly<{
  onSubmit: (draft: StopOccurrenceDraft) => void
  stop: DriverTripStop
}>

/** O mesmo texto da foto do "Não entreguei": é o mesmo bloco de captura, com a mesma redução. */
const PHOTO_ERROR_KEYS = {
  failed: 'notDelivered.photoFailed',
  'too-large': 'notDelivered.photoTooLarge',
} as const

/**
 * O motorista descreve o que viu — e só. Não há campo de valor, de custo nem de culpa: quem decide é
 * o escritório (ADR-0045 §6.1). Spec 082 D8: o motivo é escolha por chips, e a prévia mostra o
 * aviso que o cliente vai receber — inclusive quando o motivo não gera aviso nenhum.
 *
 * Spec 209: a foto é **da ocorrência**, uma só (D1), com o mesmo par do canhoto e do "Não
 * entreguei" — "Tirar foto" abre a câmera, "Anexar" a galeria. Ela nunca vira canhoto de nota.
 */
export function DriverStopOccurrenceForm({ onSubmit, stop }: DriverStopOccurrenceFormProps) {
  const { t } = useTranslation('driverTrip')
  const form = useStopOccurrenceForm()
  const cameraFieldRef = useCameraCaptureFieldRef()
  const galleryFieldRef = useCameraCaptureFieldRef()
  const photoErrorKey =
    form.photoState === 'failed' || form.photoState === 'too-large'
      ? PHOTO_ERROR_KEYS[form.photoState]
      : undefined

  const noteDocument = findOccurrencePhotoDocument(stop)
  const preview = renderOccurrenceNoticePreview({
    documentLabel: noteDocument === undefined ? '—' : noteDocument.number,
    kind: form.draft.kind,
    occurredAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    stopLabel: stop.label,
  })

  return (
    <div className={styles.occurrenceForm}>
      <div aria-label={t('occurrence')} className={styles.occurrenceChips} role="radiogroup">
        {DRIVER_OCCURRENCE_KINDS.map((option) => (
          <Button
            aria-checked={option === form.draft.kind}
            className={styles.occurrenceChip}
            key={option}
            onClick={() => form.handleKindSelect(option)}
            role="radio"
            type="button"
            variant={option === form.draft.kind ? 'default' : 'ghost'}
          >
            {t(`occurrenceKind.${option}`)}
          </Button>
        ))}
      </div>
      <label>
        <span>{t('occurrenceDescription')}</span>
        <textarea
          maxLength={500}
          onChange={(event) => form.handleDescriptionChange(event.target.value)}
          rows={3}
          value={form.draft.description}
        />
      </label>
      <div className={styles.occurrencePreview}>
        <p className={styles.occurrencePreviewTitle}>{t('occurrencePreview.title')}</p>
        {preview === null ? (
          <p className={styles.occurrencePreviewText}>{t('occurrencePreview.none')}</p>
        ) : (
          <p className={styles.occurrencePreviewText}>{preview.text}</p>
        )}
      </div>
      <div className={styles.proofCapture}>
        <p className={styles.proofCaptureTitle}>{t('occurrencePhoto')}</p>
        {form.photoPreviewUrl === undefined ? null : (
          <div className={styles.proofCaptureAttached} role="status">
            <img
              alt={t('notDelivered.photoPreview')}
              className={styles.proofCaptureThumbnail}
              src={form.photoPreviewUrl}
            />
            <span className={styles.proofCaptureAttachedText}>
              <Icon name="check" />
              {t('notDelivered.photoAttached')}
            </span>
          </div>
        )}
        <div className={styles.proofCaptureGrid}>
          <FilePickerButton
            accept="image/*"
            capture="environment"
            className={styles.proofCaptureAction}
            inputRef={cameraFieldRef}
            onSelect={form.handlePhotoSelect}
          >
            <Icon name="camera" />
            {form.draft.photo === undefined ? t('choosePhoto') : t('proofCapture.retake')}
          </FilePickerButton>
          <FilePickerButton
            accept="image/*"
            className={styles.proofCaptureAction}
            inputRef={galleryFieldRef}
            onSelect={form.handlePhotoSelect}
          >
            <Icon name="upload" />
            {t('proofCapture.attach')}
          </FilePickerButton>
        </div>
        {form.photoState === 'reading' ? (
          <p className={styles.stopMeta} role="status">
            {t('notDelivered.photoReading')}
          </p>
        ) : null}
        {photoErrorKey === undefined ? null : (
          <p className={styles.proofFieldError} role="alert">
            {t(photoErrorKey)}
          </p>
        )}
      </div>
      {/* A foto ainda sendo reduzida não pode ficar para trás: registrar espera ela terminar. */}
      <Button
        disabled={form.photoState === 'reading'}
        onClick={() => onSubmit(form.draft)}
        type="button"
      >
        <Icon name="save" />
        {t('occurrenceSend')}
      </Button>
    </div>
  )
}
