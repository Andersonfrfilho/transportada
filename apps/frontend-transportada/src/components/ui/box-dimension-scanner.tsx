/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'

import type { MediaStreamLike } from './barcodeScanner.service'
import { isArrowKey, magnifierViewportFor, nudgePoint } from './boxDimensionMarking.service'
import { overlayPointToFrame } from './boxDimensionFrame.service'
import { Badge } from './badge'
import type { Point } from './boxDimensionGeometry.service'
import type { BoxDimensionDomainWarning } from './boxDimension.constant'
import type { BoxDimensionMeasuredResult } from './boxDimensionProposal.service'
import {
  MARKED_POINT_KEYS,
  useBoxDimensionScanner,
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
  /** D13: o selo "Experimental" acompanha a medida nas DUAS etapas — aqui e na Conferência. */
  experimentalLabel: string
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
  /** M6: o worker que já compilou o OpenCV na pré-carga — compilar de novo é custo sem ganho. */
  worker?: Worker | undefined
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
  experimentalLabel,
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
  worker,
}: BoxDimensionScannerProps) {
  const {
    announcedWarning,
    bounds,
    captureFrame,
    confirmMeasurement,
    markedPoints,
    returnToLive,
    setMarkedPoint,
    snapshotUrl,
    status,
    videoRef,
  } = useBoxDimensionScanner({ isActive, onMeasured, onUnsupported, stream, worker })
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const [magnifierFor, setMagnifierFor] = useState<MarkedPointKey | undefined>(undefined)

  if (!isActive || status === 'idle' || status === 'unsupported') return null

  /** C1: o ponto marcado vive no quadro reduzido — o `<video>` nativo não entra na conta. */
  function toRelativePoint(clientX: number, clientY: number): Point | undefined {
    const overlay = overlayRef.current
    if (overlay === null) return undefined
    return overlayPointToFrame({
      clientX,
      clientY,
      frame: bounds,
      rect: overlay.getBoundingClientRect(),
    })
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
    setMarkedPoint(key, nudgePoint(current, event.key, bounds, event.shiftKey))
  }

  const magnifierPoint = magnifierFor === undefined ? undefined : markedPoints[magnifierFor]
  const magnifierViewport =
    magnifierPoint === undefined ? undefined : magnifierViewportFor(magnifierPoint, bounds)

  return (
    <div className={styles.scanner}>
      <p className={styles.title}>
        <Icon name="camera" />
        {title}
        {/* D13: o selo acompanha a medida nas duas etapas — a Conferência tem o dela no formulário. */}
        <Badge variant="secondary">
          <Icon name="alert" size="sm" />
          {experimentalLabel}
        </Badge>
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
        {status === 'capturing' && snapshotUrl !== undefined ? (
          <img alt="" className={styles.video} src={snapshotUrl} />
        ) : null}
        {status === 'loadingEngine' ? (
          <div className={styles.loadingOverlay} data-testid="box-dimension-loading">
            <Skeleton height="100%" width="100%" />
            <p className={styles.loadingMessage}>{loadingLabel}</p>
          </div>
        ) : null}
        {status === 'live' ? (
          <p aria-live="polite" className={styles.liveIndicator} role="status">
            {announcedWarning === undefined
              ? instructionLabel
              : (warningLabels[announcedWarning] ?? instructionLabel)}
          </p>
        ) : null}
        {status === 'capturing'
          ? MARKED_POINT_KEYS.map((key) => {
              const point = markedPoints[key]
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
      snapshotUrl !== undefined ? (
        <div
          aria-hidden="true"
          className={styles.magnifier}
          style={{
            backgroundImage: `url(${snapshotUrl})`,
            backgroundPosition: `-${magnifierPoint.x * magnifierViewport.zoom - 48}px -${
              magnifierPoint.y * magnifierViewport.zoom - 48
            }px`,
            backgroundSize: `${bounds.width * magnifierViewport.zoom}px ${
              bounds.height * magnifierViewport.zoom
            }px`,
          }}
        />
      ) : null}
    </div>
  )
}
