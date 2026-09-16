/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'

import type { MediaStreamLike } from './barcodeScanner.service'
import {
  clampPointToBounds,
  isArrowKey,
  magnifierViewportFor,
  nudgePoint,
} from './boxDimensionMarking.service'
import type { Point } from './boxDimensionGeometry.service'
import type { BoxDimensionDomainWarning } from './boxDimension.constant'
import {
  MARKED_POINT_KEYS,
  useBoxDimensionScanner,
  type BoxDimensionMeasuredResult,
  type BoxDimensionUnsupportedReason,
  type MarkedPointKey,
} from './useBoxDimensionScanner.hook'
import { Button } from './button'
import { Icon } from './icon'
import { Skeleton } from './skeleton'

import styles from './box-dimension-scanner.module.css'

export type BoxDimensionScannerProps = Readonly<{
  captureLabel: string
  confirmLabel: string
  instructionLabel: string
  isActive: boolean
  loadingLabel: string
  onMeasured: (result: BoxDimensionMeasuredResult) => void
  onUnsupported: (reason: BoxDimensionUnsupportedReason) => void
  pointLabels: Readonly<Record<MarkedPointKey, string>>
  retryLabel: string
  stream: MediaStreamLike | undefined
  title: string
  warningLabels: Readonly<Partial<Record<BoxDimensionDomainWarning, string>>>
}>

/**
 * Primitivo de medida de caixa pela câmera (spec 152 D18, ADR-0065). Só mostra o que o worker e o
 * motor puro decidiram — quem monta a etapa Medida no fluxo (T9-T11) decide o que fazer com
 * `onMeasured`/`onUnsupported`. Nunca manda a imagem para a rede: tudo fica em `videoRef` e no
 * canvas interno do hook.
 */
export function BoxDimensionScanner({
  captureLabel,
  confirmLabel,
  instructionLabel,
  isActive,
  loadingLabel,
  onMeasured,
  onUnsupported,
  pointLabels,
  retryLabel,
  stream,
  title,
  warningLabels,
}: BoxDimensionScannerProps) {
  const {
    captureFrame,
    confirmMeasurement,
    liveWarnings,
    markedPoints,
    returnToLive,
    setMarkedPoint,
    snapshotDataUrl,
    status,
    videoRef,
  } = useBoxDimensionScanner({ isActive, onMeasured, onUnsupported, stream })
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const [magnifierFor, setMagnifierFor] = useState<MarkedPointKey | undefined>(undefined)

  if (!isActive || status === 'idle' || status === 'unsupported') return null

  function overlayBounds(): Readonly<{ width: number; height: number }> {
    const video = videoRef.current
    return { height: video?.videoHeight ?? 0, width: video?.videoWidth ?? 0 }
  }

  function toRelativePoint(clientX: number, clientY: number): Point | undefined {
    const overlay = overlayRef.current
    const bounds = overlayBounds()
    if (overlay === null || bounds.width === 0 || bounds.height === 0) return undefined
    const rect = overlay.getBoundingClientRect()
    return clampPointToBounds(
      {
        x: ((clientX - rect.left) / rect.width) * bounds.width,
        y: ((clientY - rect.top) / rect.height) * bounds.height,
      },
      bounds,
    )
  }

  function handlePointerMove(
    key: MarkedPointKey,
    event: React.PointerEvent<HTMLButtonElement>,
  ): void {
    const point = toRelativePoint(event.clientX, event.clientY)
    if (point !== undefined) setMarkedPoint(key, point)
  }

  function handleKeyDown(key: MarkedPointKey, event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (!isArrowKey(event.key)) return
    event.preventDefault()
    const current = markedPoints[key]
    setMarkedPoint(key, nudgePoint(current, event.key, overlayBounds(), event.shiftKey))
  }

  const magnifierPoint = magnifierFor === undefined ? undefined : markedPoints[magnifierFor]
  const magnifierViewport =
    magnifierPoint === undefined ? undefined : magnifierViewportFor(magnifierPoint, overlayBounds())

  return (
    <div className={styles.scanner}>
      <p className={styles.title}>
        <Icon name="camera" />
        {title}
      </p>
      <div className={styles.viewport} ref={overlayRef}>
        <video
          aria-label={title}
          className={styles.video}
          hidden={status === 'capturing'}
          muted
          playsInline
          ref={videoRef}
        />
        {status === 'capturing' && snapshotDataUrl !== undefined ? (
          <img alt="" className={styles.video} src={snapshotDataUrl} />
        ) : null}
        {status === 'loadingEngine' ? (
          <div className={styles.loadingOverlay} data-testid="box-dimension-loading">
            <Skeleton height="100%" width="100%" />
            <p className={styles.loadingMessage}>{loadingLabel}</p>
          </div>
        ) : null}
        {status === 'live' ? (
          <p aria-live="polite" className={styles.liveIndicator} role="status">
            {liveWarnings[0] === undefined
              ? instructionLabel
              : (warningLabels[liveWarnings[0]] ?? instructionLabel)}
          </p>
        ) : null}
        {status === 'capturing'
          ? MARKED_POINT_KEYS.map((key) => {
              const point = markedPoints[key]
              const bounds = overlayBounds()
              const leftPercent = bounds.width === 0 ? 0 : (point.x / bounds.width) * 100
              const topPercent = bounds.height === 0 ? 0 : (point.y / bounds.height) * 100
              return (
                <button
                  aria-label={pointLabels[key]}
                  className={styles.markedPoint}
                  key={key}
                  onKeyDown={(event) => handleKeyDown(key, event)}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId)
                    setMagnifierFor(key)
                  }}
                  onPointerMove={(event) => {
                    if (event.buttons === 0) return
                    handlePointerMove(key, event)
                  }}
                  onPointerUp={() => setMagnifierFor(undefined)}
                  style={{ left: `${leftPercent}%`, top: `${topPercent}%` }}
                  type="button"
                />
              )
            })
          : null}
      </div>
      {status === 'live' ? (
        <Button onClick={captureFrame} type="button">
          <Icon name="camera" />
          {captureLabel}
        </Button>
      ) : null}
      {status === 'capturing' ? (
        <div className={styles.actions}>
          <Button onClick={returnToLive} type="button" variant="secondary">
            {retryLabel}
          </Button>
          <Button onClick={confirmMeasurement} type="button">
            <Icon name="check" />
            {confirmLabel}
          </Button>
        </div>
      ) : null}
      {magnifierViewport !== undefined &&
      magnifierPoint !== undefined &&
      snapshotDataUrl !== undefined ? (
        <div
          aria-hidden="true"
          className={styles.magnifier}
          style={{
            backgroundImage: `url(${snapshotDataUrl})`,
            backgroundPosition: `-${magnifierPoint.x * magnifierViewport.zoom - 48}px -${
              magnifierPoint.y * magnifierViewport.zoom - 48
            }px`,
            backgroundSize: `${overlayBounds().width * magnifierViewport.zoom}px ${
              overlayBounds().height * magnifierViewport.zoom
            }px`,
          }}
        />
      ) : null}
    </div>
  )
}
