/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import { Icon } from '@/components/ui/icon'
import { attachStreamToVideo, detachStreamFromVideo } from '@/components/ui/barcodeScanner.service'
import { useCameraStream } from '@/components/ui/useCameraStream.hook'

import {
  captureFieldDeliveryPhoto,
  loadImageFromFile,
  shouldTriggerCaptureShortcut,
} from '../shared/fieldDeliveryCapture.service'
import type { CanhotoTripDocument } from '../shared/canhotoIdentification.service'
import type {
  FieldDeliveryCapturedPhoto,
  FieldDeliveryWizardDocument,
} from '../shared/fieldDeliveryWizard.service'
import { FieldDeliveryNoteBanner } from './FieldDeliveryNoteBanner.component'
import styles from '../styles/fieldDeliveryWizard.module.css'

export type FieldDeliveryCaptureStepProps = Readonly<{
  /** M13c: `false` enquanto a chave de acesso das notas não chegou — repassado à identificação. */
  accessKeyDataAvailable?: boolean
  /** Spec 156 T14, ADR-0069 §6: interruptor da empresa — erro na leitura dele cai em `false` (R8). */
  canhotoOcrEnabled: boolean
  document: FieldDeliveryWizardDocument
  onCapture: (capture: FieldDeliveryCapturedPhoto) => void
  onSkip: () => void
  selectedDocumentIds: readonly string[]
  stepIndex: number
  totalSteps: number
  tripDocuments: readonly CanhotoTripDocument[]
}>

/**
 * Spec 156 D5/D9: preview da câmera traseira com a faixa da nota por cima, captura por botão ou
 * Enter, e "enviar arquivo" como alternativa — sempre disponível no desktop e automática quando a
 * câmera é negada ou não existe. Dono do próprio `useCameraStream`: monta só enquanto o passo é
 * "capturing" (o pai desmonta ao trocar de passo), então a trilha para sozinha ao sair.
 */
export function FieldDeliveryCaptureStep({
  accessKeyDataAvailable,
  canhotoOcrEnabled,
  document,
  onCapture,
  onSkip,
  selectedDocumentIds,
  stepIndex,
  totalSteps,
  tripDocuments,
}: FieldDeliveryCaptureStepProps) {
  const { t } = useTranslation('trip')
  const { status: cameraStatus, stream } = useCameraStream({ isActive: true })
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false)
  /** M13e (spec 156 T15): falha na captura (canvas indisponível, encode, arquivo ilegível) virava
   * rejeição não tratada — silenciosa no console, sem nada na tela. Agora é aviso, e a pessoa pode
   * tentar de novo sem sair do passo. */
  const [captureError, setCaptureError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (cameraStatus !== 'ready') return undefined
    attachStreamToVideo(videoRef.current, stream)
    return () => detachStreamFromVideo(videoRef.current)
  }, [cameraStatus, stream])

  async function runCapture(
    source: CanvasImageSource,
    width: number,
    height: number,
  ): Promise<void> {
    if (width === 0 || height === 0 || isProcessing) return
    setIsProcessing(true)
    setCaptureError(undefined)
    try {
      const capture = await captureFieldDeliveryPhoto({
        ...(accessKeyDataAvailable === undefined ? {} : { accessKeyDataAvailable }),
        canhotoOcrEnabled,
        expectedDocumentId: document.documentId,
        height,
        selectedDocumentIds,
        source,
        tripDocuments,
        width,
      })
      onCapture(capture)
    } catch {
      setCaptureError(t('fieldDelivery.captureFailed'))
    } finally {
      setIsProcessing(false)
    }
  }

  function handleCameraCapture(): void {
    const video = videoRef.current
    if (video === null) return
    void runCapture(video, video.videoWidth, video.videoHeight)
  }

  async function handleFileSelected(file: File | undefined): Promise<void> {
    if (file === undefined) return
    setCaptureError(undefined)
    try {
      const image = await loadImageFromFile(file)
      await runCapture(image, image.naturalWidth, image.naturalHeight)
    } catch {
      setCaptureError(t('fieldDelivery.captureFailed'))
    }
  }

  const showCamera = cameraStatus !== 'denied' && cameraStatus !== 'unavailable'
  const showFileFallback = !showCamera

  return (
    <div
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || !showCamera) return
        if (!shouldTriggerCaptureShortcut(event.target)) return
        event.preventDefault()
        handleCameraCapture()
      }}
    >
      {showCamera ? (
        <div className={styles.viewport}>
          <video
            aria-label={t('fieldDelivery.cameraLabel')}
            className={styles.video}
            muted
            playsInline
            ref={videoRef}
          />
          <FieldDeliveryNoteBanner
            document={document}
            stepIndex={stepIndex}
            totalSteps={totalSteps}
          />
        </div>
      ) : (
        <p className={styles.notice} role="alert">
          {cameraStatus === 'denied'
            ? t('fieldDelivery.cameraDenied')
            : t('fieldDelivery.cameraUnavailable')}
        </p>
      )}

      {captureError === undefined ? null : (
        <p className={styles.notice} role="alert">
          {captureError}
        </p>
      )}

      <div className={styles.captureActions}>
        {showCamera ? (
          <Button disabled={isProcessing} onClick={handleCameraCapture} type="button">
            <Icon name="camera" />
            {t('fieldDelivery.capture')}
          </Button>
        ) : null}
        <Button disabled={isProcessing} onClick={onSkip} type="button" variant="ghost">
          <Icon name="close" />
          {t('fieldDelivery.skip')}
        </Button>
      </div>

      {showFileFallback || isFilePickerOpen ? null : (
        <div className={styles.captureActions}>
          <Button
            onClick={() => setIsFilePickerOpen(true)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name="upload" />
            {t('fieldDelivery.uploadInstead')}
          </Button>
        </div>
      )}

      {showFileFallback || isFilePickerOpen ? (
        <FileField
          accept="image/*"
          actionLabel={t('fieldDelivery.uploadChoose')}
          capture="environment"
          disabled={isProcessing}
          label={t('fieldDelivery.uploadLabel')}
          onSelect={(file) => void handleFileSelected(file)}
          placeholder={t('fieldDelivery.uploadEmpty')}
          resetAfterSelect
        />
      ) : null}
    </div>
  )
}
