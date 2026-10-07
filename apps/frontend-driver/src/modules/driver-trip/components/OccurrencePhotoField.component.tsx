/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { Icon } from '@/components/ui/icon'

import { useCameraCaptureFieldRef } from '../hooks/useCameraCaptureFieldRef.hook'
import type { OccurrencePhotoState } from '../hooks/useOccurrenceRegistrationForm.hook'
import styles from '../styles/driverTrip.module.css'

type OccurrencePhotoFieldProps = Readonly<{
  /** A foto obrigatória que ainda não existe ganha o asterisco do botão. */
  isMissing: boolean
  /** Quantas fotos o tipo aceita: 1 (a de sempre, "Refazer") ou até o teto (RF1c). */
  limit: number
  onRemoveLast: () => void
  onSelect: (file: File) => void
  photoCount: number
  photoState: OccurrencePhotoState
  previewUrl: string | undefined
}>

/** O mesmo texto da foto do "Não entreguei": é o mesmo bloco de captura, com a mesma redução. */
const PHOTO_ERROR_KEYS = {
  failed: 'notDelivered.photoFailed',
  'too-large': 'notDelivered.photoTooLarge',
} as const

/** Sem foto, "Tirar foto"; com uma e limite 1, "Refazer"; com limite maior, a próxima. */
function resolvePhotoCaptureKey(input: {
  readonly limit: number
  readonly photoCount: number
}): string {
  if (input.photoCount === 0) return 'choosePhoto'
  return input.limit > 1 ? 'occurrenceRegistration.photoAnother' : 'proofCapture.retake'
}

/**
 * Spec 209 D1 + 246 (RF1c): a(s) foto(s) **da ocorrência** — câmera e galeria, reduzidas no aparelho —,
 * nunca a captura do canhoto. Com o tipo pedindo mais de uma, o contador diz quantas já foram, e a
 * última pode ser removida.
 */
export function OccurrencePhotoField({
  isMissing,
  limit,
  onRemoveLast,
  onSelect,
  photoCount,
  photoState,
  previewUrl,
}: OccurrencePhotoFieldProps) {
  const { t } = useTranslation('driverTrip')
  const cameraFieldRef = useCameraCaptureFieldRef()
  const galleryFieldRef = useCameraCaptureFieldRef()
  const photoErrorKey =
    photoState === 'failed' || photoState === 'too-large' ? PHOTO_ERROR_KEYS[photoState] : undefined

  return (
    <div className={styles.proofCapture}>
      <p className={styles.proofCaptureTitle}>{t('occurrencePhoto')}</p>
      {previewUrl === undefined || photoCount === 0 ? null : (
        <div className={styles.proofCaptureAttached} role="status">
          <img
            alt={t('notDelivered.photoPreview')}
            className={styles.proofCaptureThumbnail}
            src={previewUrl}
          />
          <span className={styles.proofCaptureAttachedText}>
            <Icon name="check" />
            {limit > 1
              ? t('occurrenceRegistration.photoCount', { count: photoCount, limit })
              : t('notDelivered.photoAttached')}
          </span>
        </div>
      )}
      <div className={styles.proofCaptureGrid}>
        <FilePickerButton
          accept="image/*"
          capture="environment"
          className={styles.proofCaptureAction}
          inputRef={cameraFieldRef}
          onSelect={onSelect}
        >
          <Icon name="camera" />
          {t(resolvePhotoCaptureKey({ limit, photoCount }))}
          {isMissing ? ' *' : ''}
        </FilePickerButton>
        <FilePickerButton
          accept="image/*"
          className={styles.proofCaptureAction}
          inputRef={galleryFieldRef}
          onSelect={onSelect}
        >
          <Icon name="upload" />
          {t('proofCapture.attach')}
        </FilePickerButton>
      </div>
      {limit > 1 && photoCount > 0 ? (
        <Button
          className={styles.proofCaptureAction}
          onClick={onRemoveLast}
          type="button"
          variant="ghost"
        >
          <Icon name="close" />
          {t('occurrenceRegistration.photoRemoveLast')}
        </Button>
      ) : null}
      {photoState === 'reading' ? (
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
  )
}
