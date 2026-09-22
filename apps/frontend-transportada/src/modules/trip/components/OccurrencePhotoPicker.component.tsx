/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import { Icon } from '@/components/ui/icon'
import {
  attachStreamToVideo,
  detachStreamFromVideo,
  DEFAULT_CAMERA_FACING_MODE,
  nextCameraFacingMode,
  type CameraFacingMode,
} from '@/components/ui/barcodeScanner.service'
import { useCameraStream } from '@/components/ui/useCameraStream.hook'

import { buildOccurrencePhotoAttachment } from '../shared/occurrencePhotoImage.service'
import {
  canAddOccurrencePhoto,
  OCCURRENCE_PHOTO_LIMIT,
  resolveOccurrencePhotoPickerShowsCamera,
} from '../shared/occurrencePhotoPicker.service'
import styles from '../styles/trip.module.css'

export type OccurrencePhoto = Readonly<{
  original: Blob
  photoId: string
  previewUrl: string
  thumbnail: Blob | undefined
}>

export type OccurrencePhotoPickerProps = Readonly<{
  disabled?: boolean
  onChange: (photos: readonly OccurrencePhoto[]) => void
  photos: readonly OccurrencePhoto[]
}>

/**
 * Spec 161 T23 (RF28/RF30/D3/D4): câmera traseira com captura por botão, seletor de arquivo sempre
 * disponível como alternativa (D4), miniatura local de cada foto escolhida, remover e teto de cinco
 * (CA17). Mesmo degradê de `FieldDeliveryCaptureStep` (`useCameraStream` próprio, `denied`/
 * `unavailable` caem no seletor de arquivo) — copiado dali, não reinventado.
 */
export function OccurrencePhotoPicker({
  disabled = false,
  onChange,
  photos,
}: OccurrencePhotoPickerProps) {
  const { t } = useTranslation('trip')
  const canAdd = canAddOccurrencePhoto(photos.length)
  const [facingMode, setFacingMode] = useState<CameraFacingMode>(DEFAULT_CAMERA_FACING_MODE)
  const {
    hasMultipleCameras,
    status: cameraStatus,
    stream,
  } = useCameraStream({ facingMode, isActive: canAdd })
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [captureError, setCaptureError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (cameraStatus !== 'ready') return undefined
    attachStreamToVideo(videoRef.current, stream)
    return () => detachStreamFromVideo(videoRef.current)
  }, [cameraStatus, stream])

  // As URLs locais são deste componente — revoga ao desmontar, para não vazar memória entre
  // aberturas sucessivas do diálogo. O ref segue a lista atual sem recriar o efeito a cada foto.
  const photosRef = useRef(photos)
  photosRef.current = photos
  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl)
    }
  }, [])

  async function addPhoto(file: File): Promise<void> {
    if (!canAdd || isProcessing) return
    setIsProcessing(true)
    setCaptureError(undefined)
    try {
      const attachment = await buildOccurrencePhotoAttachment(file)
      const photo: OccurrencePhoto = {
        original: attachment.original,
        photoId: crypto.randomUUID(),
        previewUrl: URL.createObjectURL(attachment.original),
        thumbnail: attachment.thumbnail,
      }
      onChange([...photos, photo])
    } catch {
      setCaptureError(t('occurrence.photoPicker.captureFailed'))
    } finally {
      setIsProcessing(false)
    }
  }

  function removePhoto(photoId: string): void {
    const removed = photos.find((photo) => photo.photoId === photoId)
    if (removed !== undefined) URL.revokeObjectURL(removed.previewUrl)
    onChange(photos.filter((photo) => photo.photoId !== photoId))
  }

  function handleCameraCapture(): void {
    const video = videoRef.current
    if (video === null || video.videoWidth === 0 || video.videoHeight === 0) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (context === null) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (blob === null) return
      void addPhoto(new File([blob], 'occurrence-photo.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg')
  }

  const showCamera = resolveOccurrencePhotoPickerShowsCamera(cameraStatus)

  return (
    <div className={styles.occurrencePhotoPicker}>
      {showCamera && canAdd ? (
        <div className={styles.occurrencePhotoViewport}>
          <video
            aria-label={t('occurrence.photoPicker.cameraLabel')}
            className={styles.occurrencePhotoVideo}
            muted
            playsInline
            ref={videoRef}
          />
        </div>
      ) : null}

      {!showCamera && canAdd ? (
        <p className={styles.hint} role="alert">
          {cameraStatus === 'denied'
            ? t('occurrence.photoPicker.cameraDenied')
            : t('occurrence.photoPicker.cameraUnavailable')}
        </p>
      ) : null}

      {captureError === undefined ? null : (
        <p className={styles.hint} role="alert">
          {captureError}
        </p>
      )}

      {photos.length === 0 ? (
        <p className={styles.hint}>{t('occurrence.photoPicker.empty')}</p>
      ) : (
        <ul className={styles.occurrencePhotoGrid}>
          {photos.map((photo) => (
            <li className={styles.occurrencePhotoThumb} key={photo.photoId}>
              <img alt={t('occurrence.photoPicker.thumbAlt')} src={photo.previewUrl} />
              <button
                aria-label={t('occurrence.photoPicker.remove')}
                className={styles.occurrencePhotoRemove}
                disabled={disabled}
                onClick={() => removePhoto(photo.photoId)}
                type="button"
              >
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {canAdd ? (
        <div className={styles.occurrencePhotoActions}>
          {showCamera ? (
            <Button
              aria-busy={isProcessing}
              disabled={disabled || isProcessing}
              onClick={handleCameraCapture}
              size="sm"
              type="button"
            >
              <Icon name="camera" />
              {t('occurrence.photoPicker.capture')}
            </Button>
          ) : null}
          {/* Só aparece em aparelho com mais de uma câmera: botão que não faz nada é pior que
              botão nenhum. O rótulo diz para qual câmera vai, não em qual está. */}
          {showCamera && hasMultipleCameras ? (
            <Button
              disabled={disabled || isProcessing}
              onClick={() => setFacingMode(nextCameraFacingMode(facingMode))}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="refresh" />
              {facingMode === 'environment'
                ? t('occurrence.photoPicker.switchToFront')
                : t('occurrence.photoPicker.switchToBack')}
            </Button>
          ) : null}
          <FileField
            accept="image/*"
            actionLabel={t('occurrence.photoPicker.uploadChoose')}
            capture={facingMode === 'environment' ? 'environment' : 'user'}
            disabled={disabled || isProcessing}
            label={t('occurrence.photoPicker.uploadLabel')}
            onSelect={(file) => void (file !== undefined && addPhoto(file))}
            placeholder={t('occurrence.photoPicker.uploadEmpty')}
            resetAfterSelect
          />
        </div>
      ) : (
        <p className={styles.hint}>
          {t('occurrence.photoPicker.limitReached', { limit: OCCURRENCE_PHOTO_LIMIT })}
        </p>
      )}
    </div>
  )
}
