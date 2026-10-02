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
  nextCropRotation,
  rotatedCropSize,
  toLuminanceGrid,
  type CropCorners,
  type CropRotation,
} from '../shared/proofCrop.service'
import { resolveInitialCropBounds } from '../shared/proofCropFrame.service'
import styles from '../styles/driverTrip.module.css'

const PREVIEW_MAX_WIDTH = 480

type CornerKey = keyof CropCorners

type RotatedSource = CanvasImageSource & { height: number; width: number }

/**
 * Impura: devolve a imagem já girada, para o resto do fluxo tratá-la como se fosse o original. Em
 * 0° devolve a própria imagem — girar zero grau só gastaria um canvas do tamanho da foto.
 * Sem contexto 2D (aparelho sem canvas) devolve o original: melhor sem girar que sem recorte.
 */
function buildRotatedSource(image: HTMLImageElement, rotation: CropRotation): RotatedSource {
  if (rotation === 0) return image

  const { height, width } = rotatedCropSize({
    height: image.height,
    rotation,
    width: image.width,
  })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) return image

  context.translate(width / 2, height / 2)
  context.rotate((rotation * Math.PI) / 180)
  context.drawImage(image, -image.width / 2, -image.height / 2)
  return canvas
}

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
  /** A origem do recorte: a imagem em 0°, ou o canvas já girado. Toda coordenada vive no espaço dela. */
  const sourceRef = useRef<CanvasImageSource & { height: number; width: number }>(null)
  const draggingRef = useRef<CornerKey | null>(null)
  const [corners, setCorners] = useState<CropCorners | null>(null)
  const [isImageReady, setIsImageReady] = useState(false)
  const [rotation, setRotation] = useState<CropRotation>(0)
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
      setIsImageReady(true)
    }
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  /**
   * Girar UMA vez, para uma origem já rotacionada, e deixar o resto da matemática intacto: a
   * detecção, o arrasto dos cantos e o recorte final seguem todos em "pixel da origem", sem
   * trigonometria inversa espalhada. Em 0° a origem é a própria imagem — nenhum canvas extra.
   */
  useEffect(() => {
    const image = imageRef.current
    if (!isImageReady || image === null) return

    const source = buildRotatedSource(image, rotation)
    sourceRef.current = source
    const scale = Math.min(1, PREVIEW_MAX_WIDTH / source.width)
    const width = Math.round(source.width * scale)
    const height = Math.round(source.height * scale)
    setSize({ height, width })

    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas === null || context === null || context === undefined) return
    canvas.width = width
    canvas.height = height
    context.drawImage(source, 0, 0, width, height)
    /** A detecção roda sobre a imagem JÁ girada: sobre a original ela sugeriria cantos tortos. */
    const bounds = detectDocumentBounds(toLuminanceGrid(context.getImageData(0, 0, width, height)))
    setCorners(boundsToCorners(resolveInitialCropBounds({ detected: bounds, height, width })))
  }, [isImageReady, rotation])

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
    /** A origem girada, não a imagem: os cantos foram arrastados sobre ela. */
    const image = sourceRef.current
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
        {/*
         * Pedido do usuário (01/10): girar a foto. Um quarto de volta por toque — quatro toques
         * voltam ao começo, então não precisa de um segundo botão para desfazer.
         */}
        <Button
          onClick={() => setRotation((current) => nextCropRotation(current))}
          type="button"
          variant="secondary"
        >
          <Icon name="refresh" />
          {t('crop.rotate')}
        </Button>
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
