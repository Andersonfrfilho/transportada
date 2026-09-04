/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import {
  enterSignatureFullscreen,
  exitSignatureFullscreen,
} from '../shared/signatureCapture.service'
import styles from '../styles/driverTrip.module.css'

const SIGNATURE_WIDTH = 600
const SIGNATURE_HEIGHT = 240

type SignaturePadProps = Readonly<{
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}>

/**
 * Spec 082 D3: o traço é por pointer events — dedo, caneta e mouse entram pela mesma porta. O
 * componente exporta PNG e devolve o blob; quem sabe o que fazer com ele é o fluxo de comprovante.
 */
export function SignaturePad({ onCancel, onConfirm }: SignaturePadProps) {
  const { t } = useTranslation('driverTrip')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const isDrawingRef = useRef(false)
  const [hasStroke, setHasStroke] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  /** Sem lock (iOS) o conteúdo rotaciona por CSS para o traço ficar horizontal. */
  const [isCssRotated, setIsCssRotated] = useState(false)

  function toCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    const context = canvasRef.current?.getContext('2d')
    if (context === null || context === undefined) return
    event.currentTarget.setPointerCapture(event.pointerId)
    isDrawingRef.current = true
    const point = toCanvasPoint(event)
    context.strokeStyle = '#111111'
    context.lineWidth = 3
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(point.x, point.y)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!isDrawingRef.current) return
    const context = canvasRef.current?.getContext('2d')
    if (context === null || context === undefined) return
    const point = toCanvasPoint(event)
    context.lineTo(point.x, point.y)
    context.stroke()
    setHasStroke(true)
  }

  function handlePointerUp(): void {
    isDrawingRef.current = false
  }

  function handleClear(): void {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas === null || context === null || context === undefined) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    setHasStroke(false)
  }

  async function handleEnterFullscreen(): Promise<void> {
    const container = containerRef.current
    if (container === null) return
    const { isLandscapeLocked } = await enterSignatureFullscreen(container)
    setIsFullscreen(true)
    setIsCssRotated(!isLandscapeLocked)
  }

  async function handleExitFullscreen(): Promise<void> {
    await exitSignatureFullscreen()
    setIsFullscreen(false)
    setIsCssRotated(false)
  }

  function handleConfirm(): void {
    const canvas = canvasRef.current
    if (canvas === null || !hasStroke) return
    /** O fundo é pintado branco antes da exportação: PNG transparente vira canhoto invisível. */
    const flattened = document.createElement('canvas')
    flattened.width = canvas.width
    flattened.height = canvas.height
    const context = flattened.getContext('2d')
    if (context === null) return
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, flattened.width, flattened.height)
    context.drawImage(canvas, 0, 0)
    flattened.toBlob((blob) => {
      if (blob === null) return
      void exitSignatureFullscreen()
      setIsFullscreen(false)
      setIsCssRotated(false)
      onConfirm(blob)
    }, 'image/png')
  }

  const containerClassName = [
    styles.signaturePad,
    isFullscreen ? styles.signaturePadFullscreen : '',
    isCssRotated ? styles.signaturePadRotated : '',
  ].join(' ')

  return (
    <div className={containerClassName} ref={containerRef}>
      <canvas
        aria-label={t('signature.canvasLabel')}
        className={styles.signatureCanvas}
        height={SIGNATURE_HEIGHT}
        width={SIGNATURE_WIDTH}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <div className={styles.actions}>
        <Button
          aria-label={t('signature.clear')}
          onClick={handleClear}
          type="button"
          variant="ghost"
        >
          <Icon name="close" />
          {t('signature.clear')}
        </Button>
        {isFullscreen ? (
          <Button onClick={() => void handleExitFullscreen()} type="button" variant="ghost">
            {t('signature.exitFullscreen')}
          </Button>
        ) : (
          <Button onClick={() => void handleEnterFullscreen()} type="button" variant="ghost">
            {t('signature.fullscreen')}
          </Button>
        )}
        <Button onClick={onCancel} type="button" variant="ghost">
          {t('signature.cancel')}
        </Button>
        <Button disabled={!hasStroke} onClick={handleConfirm} type="button">
          <Icon name="check" />
          {t('signature.confirm')}
        </Button>
      </div>
    </div>
  )
}
