/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import {
  boundsToCorners,
  cornersToBounds,
  detectDocumentBounds,
  toLuminanceGrid,
  type CropCorners,
} from '../shared/proofCrop.service'
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const draggingRef = useRef<CornerKey | null>(null)
  const [corners, setCorners] = useState<CropCorners | null>(null)
  const [size, setSize] = useState<{ height: number; width: number } | null>(null)

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
      setCorners(boundsToCorners(bounds ?? { bottom: height, left: 0, right: width, top: 0 }))
    }
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const key = draggingRef.current
    if (key === null || corners === null || size === null) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(event.clientX - rect.left, 0), size.width)
    const y = Math.min(Math.max(event.clientY - rect.top, 0), size.height)
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
    <div className={styles.proofCrop}>
      <div
        className={styles.proofCropStage}
        onPointerMove={handlePointerMove}
        onPointerUp={() => {
          draggingRef.current = null
        }}
      >
        <canvas aria-label={t('crop.previewLabel')} ref={canvasRef} />
        {corners === null
          ? null
          : (Object.keys(corners) as readonly CornerKey[]).map((key) => (
              <button
                aria-label={t(`crop.corner.${key}`)}
                className={styles.proofCropHandle}
                key={key}
                style={{ left: `${corners[key].x}px`, top: `${corners[key].y}px` }}
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
