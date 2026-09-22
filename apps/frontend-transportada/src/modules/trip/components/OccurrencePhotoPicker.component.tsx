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
  /**
   * Revisão de UX (spec 161): só a foto tirada pela câmera pede confirmação antes de remover — a
   * escolhida por arquivo é fácil de recolocar (o seletor já lembra a última pasta), a tirada pela
   * câmera não: se o motorista já saiu de perto da avaria, a segunda foto pode não existir mais.
   */
  source: 'camera' | 'upload'
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
    hasTorch,
    status: cameraStatus,
    stream,
    toggleTorch,
    torchOn,
  } = useCameraStream({ facingMode, isActive: canAdd })
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [captureError, setCaptureError] = useState<string | undefined>(undefined)
  /** Revisão de UX (spec 161): id da foto de câmera com remoção armada — segundo toque confirma. */
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | undefined>(undefined)

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

  async function addPhoto(file: File, source: OccurrencePhoto['source']): Promise<void> {
    if (!canAdd || isProcessing) return
    setIsProcessing(true)
    setCaptureError(undefined)
    try {
      const attachment = await buildOccurrencePhotoAttachment(file)
      const photo: OccurrencePhoto = {
        original: attachment.original,
        photoId: crypto.randomUUID(),
        previewUrl: URL.createObjectURL(attachment.original),
        source,
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
    setConfirmingRemoveId(undefined)
  }

  /**
   * Revisão de UX (spec 161): a `previewUrl` é revogada na hora — não existe desfazer depois de
   * remover. Foto de câmera pede um segundo toque (o botão vira "confirmar remoção"); a escolhida
   * por arquivo continua removendo de primeira, como antes.
   */
  function handleRemoveClick(photo: OccurrencePhoto): void {
    if (photo.source === 'camera' && confirmingRemoveId !== photo.photoId) {
      setConfirmingRemoveId(photo.photoId)
      return
    }
    removePhoto(photo.photoId)
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
      void addPhoto(new File([blob], 'occurrence-photo.jpg', { type: 'image/jpeg' }), 'camera')
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

      {/* Revisão de UX (spec 161): os dois mudam o fluxo (câmera não vai funcionar, foto não foi
          processada) — `.alert` (copper) em vez de `.hint` (cinza de legenda) para não ler como
          detalhe opcional. */}
      {!showCamera && canAdd ? (
        <p className={styles.alert} role="alert">
          {cameraStatus === 'denied'
            ? t('occurrence.photoPicker.cameraDenied')
            : t('occurrence.photoPicker.cameraUnavailable')}
        </p>
      ) : null}

      {captureError === undefined ? null : (
        <p className={styles.alert} role="alert">
          {captureError}
        </p>
      )}

      {photos.length === 0 ? (
        <p className={styles.hint}>{t('occurrence.photoPicker.empty')}</p>
      ) : (
        <ul className={styles.occurrencePhotoGrid}>
          {photos.map((photo) => {
            const isConfirming = confirmingRemoveId === photo.photoId
            return (
              <li className={styles.occurrencePhotoThumb} key={photo.photoId}>
                <img alt={t('occurrence.photoPicker.thumbAlt')} src={photo.previewUrl} />
                <button
                  aria-label={
                    isConfirming
                      ? t('occurrence.photoPicker.removeConfirm')
                      : t('occurrence.photoPicker.remove')
                  }
                  className={
                    isConfirming
                      ? styles.occurrencePhotoRemoveConfirming
                      : styles.occurrencePhotoRemove
                  }
                  disabled={disabled}
                  onBlur={() => setConfirmingRemoveId(undefined)}
                  onClick={() => handleRemoveClick(photo)}
                  type="button"
                >
                  <Icon name={isConfirming ? 'check' : 'trash'} />
                </button>
              </li>
            )
          })}
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
          {/*
           * Lanterna: o galpão à noite e o fundo do baú são escuros, e foto escura não prova nada.
           * Só aparece quando a trilha ativa expõe `torch` — o botão diz se está ligada.
           *
           * Ícone (revisão de UX spec 161): `sun`/`moon` saíram porque `moon` já significa "tema
           * escuro" no resto do produto — usar o mesmo desenho para "lanterna apagada" cria dois
           * significados para o mesmo ícone. `contrast` (o dial de brilho) não colide com nenhuma
           * outra ação do catálogo (`icon.tsx`) e o estado (ligada/apagada) continua explícito pelo
           * texto do rótulo e por `aria-pressed` — o ícone nunca é a única pista.
           */}
          {showCamera && hasTorch ? (
            <Button
              aria-pressed={torchOn}
              disabled={disabled}
              onClick={toggleTorch}
              size="sm"
              type="button"
              variant={torchOn ? 'secondary' : 'ghost'}
            >
              <Icon name="contrast" />
              {t(torchOn ? 'occurrence.photoPicker.torchOff' : 'occurrence.photoPicker.torchOn')}
            </Button>
          ) : null}
          {/*
           * Só aparece em aparelho com mais de uma câmera: botão que não faz nada é pior que botão
           * nenhum. O rótulo diz para qual câmera vai, não em qual está.
           *
           * Ícone (revisão de UX spec 161): mantive `refresh`, mesmo sabendo que em outra dezena de
           * telas do produto ele significa "recarregar dado do servidor" (`TripFinancialPanel`,
           * `NfseAuthorizationRefresh`, …). Não há ícone de "trocar câmera"/"virar" no catálogo
           * (`icon.tsx`): as duas setas em círculo de `refresh` são, entre os disponíveis, o único
           * desenho que comunica "alternar entre dois estados" sem inventar um SVG novo fora do
           * design system — e o rótulo ao lado ("Usar câmera frontal/traseira") sempre desfaz a
           * ambiguidade. Trocar por outro ícone do catálogo (`sort`, `columns`) seria pior: os dois
           * já têm significado fixado alhures (ordenação de coluna, layout).
           */}
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
            className={styles.occurrencePhotoUpload}
            disabled={disabled || isProcessing}
            label={t('occurrence.photoPicker.uploadLabel')}
            onSelect={(file) => void (file !== undefined && addPhoto(file, 'upload'))}
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
