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
import { FIELD_DELIVERY_FOCUS_ATTRIBUTE } from '../shared/fieldDeliveryWizardFocus.service'
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
  const focusMarker = { [FIELD_DELIVERY_FOCUS_ATTRIBUTE]: '' }

  return (
    <div
      className={styles.captureStep}
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
        <>
          {/* Sem câmera a faixa some junto com o vídeo — a nota esperada continua à vista. */}
          <FieldDeliveryNoteBanner
            document={document}
            isStatic
            stepIndex={stepIndex}
            totalSteps={totalSteps}
          />
          <p className={styles.notice} role="alert">
            {cameraStatus === 'denied'
              ? t('fieldDelivery.cameraDenied')
              : t('fieldDelivery.cameraUnavailable')}
          </p>
        </>
      )}

      {captureError === undefined ? null : (
        <p className={styles.notice} role="alert">
          {captureError}
        </p>
      )}

      {showFileFallback || isFilePickerOpen ? (
        <div {...(showFileFallback ? focusMarker : {})}>
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
        </div>
      ) : (
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

      <div className={styles.stepActions}>
        <Button disabled={isProcessing} onClick={onSkip} type="button" variant="ghost">
          <Icon name="chevron-right" />
          {t('fieldDelivery.skip')}
        </Button>
        {showCamera ? (
          /* Sem `disabled` durante a leitura: o botão focado perderia o foco para o `<body>`, e o
             Enter/Esc deixariam de chegar ao diálogo. `runCapture` já ignora o toque repetido. */
          <Button
            aria-busy={isProcessing}
            onClick={handleCameraCapture}
            type="button"
            {...focusMarker}
          >
            <Icon name="camera" />
            {isProcessing ? t('fieldDelivery.capturing') : t('fieldDelivery.capture')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
