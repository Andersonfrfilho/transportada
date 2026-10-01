/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/components/ProofCrop.component.tsx (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useRevealedPanel } from '@/modules/shared/useRevealedPanel.hook'

import { captureRegistry } from '../shared/captureRegistry.service'
import {
  boundsToCorners,
  cornersToBounds,
  detectDocumentBounds,
  toLuminanceGrid,
  type CropCorners,
} from '../shared/proofCrop.service'
import { resolveInitialCropBounds } from '../shared/proofCropFrame.service'
import styles from '../styles/driverTrip.module.css'

const PREVIEW_MAX_WIDTH = 480

type CornerKey = keyof CropCorners

type ProofCropProps = Readonly<{
  file: File
  onCancel: () => void
  /** O upload envia **só o recorte** — ou o original, quando o motorista escolhe. */
  onConfirm: (file: File) => void
}>

/**
 * Spec 082 D5/T052: a detecção sugere o retângulo, os quatro cantos ajustam à mão, e "Usar sem
 * recorte" é sempre um toque — a detecção é sugestão, nunca portão.
 */
export function ProofCrop({ file, onCancel, onConfirm }: ProofCropProps) {
  const { t } = useTranslation('driverTrip')
  /** Pedido do usuário (25/09, spec 207): abrir o recorte rola até ele e foca — sem isso, quem
   * está fora da dobra não vê nada acontecer ao tocar "Anexar"/"Tirar foto". */
  const { panelRef } = useRevealedPanel<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const draggingRef = useRef<CornerKey | null>(null)
  const [corners, setCorners] = useState<CropCorners | null>(null)
  const [size, setSize] = useState<{ height: number; width: number } | null>(null)

  /** Plan D2: aberto do montar ao desmontar — navegar no meio do recorte perdia o ajuste. */
  useEffect(() => {
    captureRegistry.open('crop')
    return () => captureRegistry.close('crop')
  }, [])

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      imageRef.current = image
      const scale = Math.min(1, PREVIEW_MAX_WIDTH / image.width)
      const width = Math.round(image.width * scale)
      const height = Math.round(image.height * scale)
      setSize({ height, width })

      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (canvas === null || context === null || context === undefined) return
      canvas.width = width
      canvas.height = height
      context.drawImage(image, 0, 0, width, height)
      const bounds = detectDocumentBounds(
        toLuminanceGrid(context.getImageData(0, 0, width, height)),
      )
      setCorners(boundsToCorners(resolveInitialCropBounds({ detected: bounds, height, width })))
    }
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const frame =
    corners === null || size === null
      ? null
      : cornersToBounds({ corners, height: size.height, width: size.width })

  /**
   * `.proofCropStage canvas` leva `max-width: 100%`: em tela de motorista mais estreita que
   * `PREVIEW_MAX_WIDTH`, o canvas renderiza menor do que a resolução interna (`size`). Sem esta
   * razão, `clientX/Y` chegam em pixel CSS (da caixa encolhida) enquanto `corners` — e o recorte
   * final em `confirmCrop` — são em pixel do canvas, e o canto arrastado nunca cai onde o dedo
   * tocou.
   */
  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const key = draggingRef.current
    if (key === null || corners === null || size === null) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const scaleX = size.width / rect.width
    const scaleY = size.height / rect.height
    const x = Math.min(Math.max((event.clientX - rect.left) * scaleX, 0), size.width)
    const y = Math.min(Math.max((event.clientY - rect.top) * scaleY, 0), size.height)
    setCorners({ ...corners, [key]: { x, y } })
  }

  function confirmCrop(): void {
    const image = imageRef.current
    if (image === null || corners === null || size === null) return
    const bounds = cornersToBounds({ corners, height: size.height, width: size.width })
    const scaleX = image.width / size.width
    const scaleY = image.height / size.height
    const cropWidth = Math.round((bounds.right - bounds.left) * scaleX)
    const cropHeight = Math.round((bounds.bottom - bounds.top) * scaleY)
    const target = document.createElement('canvas')
    target.width = cropWidth
    target.height = cropHeight
    const context = target.getContext('2d')
    if (context === null) return
    context.drawImage(
      image,
      Math.round(bounds.left * scaleX),
      Math.round(bounds.top * scaleY),
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight,
    )
    target.toBlob((blob) => {
      if (blob === null) return
      onConfirm(new File([blob], file.name, { type: 'image/jpeg' }))
    }, 'image/jpeg')
  }

  return (
    <div className={styles.proofCrop} ref={panelRef}>
      <div
        className={styles.proofCropStage}
        onPointerMove={handlePointerMove}
        onPointerUp={() => {
          draggingRef.current = null
        }}
      >
        <canvas aria-label={t('crop.previewLabel')} ref={canvasRef} tabIndex={-1} />
        {frame === null || size === null ? null : (
          <div
            aria-hidden="true"
            className={styles.proofCropFrame}
            /**
             * Percentual, não pixel: igual aos cantos abaixo, o canvas pode renderizar menor que
             * `size` (CSS `max-width: 100%`), e o percentual acompanha a escala sem recalcular nada.
             */
            style={{
              height: `${((frame.bottom - frame.top) / size.height) * 100}%`,
              left: `${(frame.left / size.width) * 100}%`,
              top: `${(frame.top / size.height) * 100}%`,
              width: `${((frame.right - frame.left) / size.width) * 100}%`,
            }}
          />
        )}
        {corners === null || size === null
          ? null
          : (Object.keys(corners) as readonly CornerKey[]).map((key) => (
              <button
                aria-label={t(`crop.corner.${key}`)}
                className={styles.proofCropHandle}
                key={key}
                /**
                 * Percentual, não pixel: o canvas pode renderizar menor que `size` (mesmo
                 * `max-width: 100%`), e o percentual acompanha a escala sem recalcular nada — o
                 * `clamp` com `--crop-handle-half` continua em vigor para o alvo não passar da borda.
                 */
                style={{
                  left: `clamp(var(--crop-handle-half), ${(corners[key].x / size.width) * 100}%, calc(100% - var(--crop-handle-half)))`,
                  top: `clamp(var(--crop-handle-half), ${(corners[key].y / size.height) * 100}%, calc(100% - var(--crop-handle-half)))`,
                }}
                type="button"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId)
                  draggingRef.current = key
                }}
              />
            ))}
      </div>
      <div className={styles.actions}>
        <Button onClick={onCancel} type="button" variant="ghost">
          {t('crop.cancel')}
        </Button>
        <Button onClick={() => onConfirm(file)} type="button" variant="ghost">
          {t('crop.useOriginal')}
        </Button>
        <Button onClick={confirmCrop} type="button">
          <Icon name="check" />
          {t('crop.useCrop')}
        </Button>
      </div>
    </div>
  )
}
