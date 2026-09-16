/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Point } from './boxDimensionGeometry.service'
import { estimateMargins, measureBox } from './boxDimension.service'
import {
  buildMeasuredProposal,
  type BoxDimensionMeasuredResult,
} from './boxDimensionProposal.service'
import {
  buildBoxMeasurementInput,
  frameSizeFor,
  MAXIMUM_FRAME_WIDTH,
  type ScannerFrame,
} from './boxDimensionFrame.service'
import {
  detectWarnings,
  selectDomainWarnings,
  type FrameStats,
} from './boxDimensionWarnings.service'
import {
  attachStreamToVideo,
  detachStreamFromVideo,
  type MediaStreamLike,
} from './barcodeScanner.service'
import type { BoxDimensionWorkerRequest, BoxDimensionWorkerResponse } from './boxDimension.worker'

const FRAME_INTERVAL_MS = 250
/** D18: 15s sem `ready` é o teto do carregamento do OpenCV; acima disso, `engineFailed`. */
const ENGINE_LOAD_TIMEOUT_MS = 15_000
/** D-fallback: acima de 800ms por quadro, 3 vezes seguidas, o aparelho não acompanha (`tooSlow`). */
const SLOW_FRAME_THRESHOLD_MS = 800
const SLOW_FRAME_STRIKES = 3
/**
 * R2 pede 500 ms entre anúncios do indicador ao vivo; o quadro chega a cada 250 ms. Mesmo remédio
 * do `REPEAT_ANNOUNCE_COOLDOWN_MS` do leitor de etiqueta: repetir a mesma frase no `aria-live`
 * empilha fala em cima de fala e o operador não ouve nenhuma inteira (T14 item M8).
 */
const LIVE_WARNING_ANNOUNCE_INTERVAL_MS = 500

export type BoxDimensionScannerStatus =
  'capturing' | 'idle' | 'live' | 'loadingEngine' | 'measured' | 'unsupported'

export type BoxDimensionUnsupportedReason = 'engineFailed' | 'noWasm' | 'tooSlow'

/** A proposta nasce em `boxDimensionProposal.service` — aqui só o reexporte de sempre. */
export type { BoxDimensionMeasuredResult }

export type UseBoxDimensionScannerParams = Readonly<{
  isActive: boolean
  onMeasured: (result: BoxDimensionMeasuredResult) => void
  onUnsupported: (reason: BoxDimensionUnsupportedReason) => void
  stream: MediaStreamLike | undefined
  /**
   * D18/T14 item M6: o worker que o fluxo já usou para pré-carregar o OpenCV. Compilar o WASM duas
   * vezes é o custo de dois workers, e o segundo não traz nada — quem empresta é quem termina.
   */
  worker?: Worker | undefined
}>

/** A, B, C, D ao redor da face de cima; E é o pé da aresta vertical visível (`boxDimension.service`). */
export const MARKED_POINT_KEYS = ['a', 'b', 'c', 'd', 'foot'] as const
export type MarkedPointKey = (typeof MARKED_POINT_KEYS)[number]
export type MarkedPoints = Readonly<Record<MarkedPointKey, Point>>

function defaultMarkedPoints(frame: ScannerFrame): MarkedPoints {
  const left = frame.width * 0.3
  const right = frame.width * 0.7
  const top = frame.height * 0.3
  const bottom = frame.height * 0.55
  return {
    a: { x: left, y: top },
    b: { x: right, y: top },
    c: { x: right, y: bottom },
    d: { x: left, y: bottom },
    foot: { x: left, y: frame.height * 0.85 },
  }
}

export type BoxDimensionDomainWarningCode = ReturnType<typeof selectDomainWarnings>[number]

export type BoxDimensionScannerController = Readonly<{
  /** M8: o motivo que o `aria-live` fala — no máximo um a cada 500 ms, e nunca o mesmo duas vezes. */
  announcedWarning: BoxDimensionDomainWarningCode | undefined
  /** O espaço em que os pontos marcados vivem: o quadro reduzido, nunca o `<video>` nativo (C1). */
  bounds: ScannerFrame
  captureFrame: () => void
  confirmMeasurement: () => void
  liveWarnings: ReturnType<typeof selectDomainWarnings>
  markedPoints: MarkedPoints
  returnToLive: () => void
  setMarkedPoint: (key: MarkedPointKey, point: Point) => void
  snapshotUrl: string | undefined
  status: BoxDimensionScannerStatus
  videoRef: (element: HTMLVideoElement | null) => void
}>

const EMPTY_FRAME: ScannerFrame = { height: 0, width: 0 }

function captureFrameStats(
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement,
): Readonly<{ width: number; height: number; rgba: Uint8ClampedArray }> | undefined {
  if (video === null || video.videoWidth === 0 || video.videoHeight === 0) return undefined
  const { height, width } = frameSizeFor(video.videoWidth, video.videoHeight)
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) return undefined
  context.drawImage(video, 0, 0, width, height)
  return { height, rgba: context.getImageData(0, 0, width, height).data, width }
}

/**
 * Orquestra o worker de medida (`boxDimension.worker.ts`, OpenCV sob demanda) e o motor puro
 * (`boxDimension.service.ts`, T6). O worker só acha o marcador e as estatísticas do quadro — pose e
 * margem continuam em TS puro, fora do worker (ADR-0065 §1).
 *
 * ⚠️ **Tudo o que a medida toca vive no espaço do quadro reduzido** (`boxDimensionFrame.service`):
 * os cantos do marcador voltam do worker nele, os pontos marcados nascem nele e `imageWidth`/
 * `imageHeight` são os dele. Misturar com `video.videoWidth` devolve medida plausível e errada.
 */
export function useBoxDimensionScanner({
  isActive,
  onMeasured,
  onUnsupported,
  stream,
  worker: borrowedWorker,
}: UseBoxDimensionScannerParams): BoxDimensionScannerController {
  const videoElementRef = useRef<HTMLVideoElement | null>(null)
  const [videoElement, setVideoElementState] = useState<HTMLVideoElement | null>(null)
  const [status, setStatus] = useState<BoxDimensionScannerStatus>('idle')
  const [liveFrameStats, setLiveFrameStats] = useState<FrameStats | undefined>(undefined)
  const [markedPoints, setMarkedPoints] = useState<MarkedPoints>(() =>
    defaultMarkedPoints(EMPTY_FRAME),
  )
  const [liveFrame, setLiveFrame] = useState<ScannerFrame>(EMPTY_FRAME)
  const [snapshotUrl, setSnapshotUrl] = useState<string | undefined>(undefined)
  const snapshotObjectUrlRef = useRef<string | undefined>(undefined)
  const capturedRef = useRef<
    | Readonly<{ frame: ScannerFrame; frameStats: FrameStats; markerCorners: readonly Point[] }>
    | undefined
  >(undefined)
  const onMeasuredRef = useRef(onMeasured)
  const onUnsupportedRef = useRef(onUnsupported)
  const lastFrameRef = useRef<
    Readonly<{ frameStats: FrameStats; markerCorners: readonly Point[] }> | undefined
  >(undefined)
  const slowFrameStrikesRef = useRef(0)
  const [announcedWarning, setAnnouncedWarning] = useState<
    BoxDimensionDomainWarningCode | undefined
  >(undefined)
  const lastAnnouncedAtRef = useRef(0)

  useEffect(() => {
    onMeasuredRef.current = onMeasured
  }, [onMeasured])
  useEffect(() => {
    onUnsupportedRef.current = onUnsupported
  }, [onUnsupported])

  /**
   * C2: a trilha chega ao elemento **depois** que ele existe. O callback ref abaixo é quem dá o
   * sinal; ler `ref.current` dentro do efeito que revela o `<video>` achava `null` e a etapa Medida
   * ficava preta para sempre, sem erro nenhum.
   */
  const videoRef = useCallback((element: HTMLVideoElement | null) => {
    videoElementRef.current = element
    setVideoElementState(element)
  }, [])

  useEffect(() => {
    if (!attachStreamToVideo(videoElement, stream)) return
    return () => detachStreamFromVideo(videoElement)
  }, [stream, videoElement])

  const liveWarnings = selectDomainWarnings(
    liveFrameStats === undefined ? [] : detectWarnings(liveFrameStats),
  )
  const liveWarning = liveWarnings[0]

  /**
   * M8/R2: o quadro chega a cada 250 ms e o motivo muda de um para o outro enquanto a mão se
   * acomoda. Anunciar tudo isso no `aria-live` empilha fala sobre fala e o operador não escuta
   * nenhuma frase inteira — mesmo remédio do `REPEAT_ANNOUNCE_COOLDOWN_MS` do leitor de etiqueta.
   */
  useEffect(() => {
    if (liveWarning === announcedWarning) return
    const waitMs = Math.max(
      0,
      LIVE_WARNING_ANNOUNCE_INTERVAL_MS - (Date.now() - lastAnnouncedAtRef.current),
    )
    const timer = setTimeout(() => {
      lastAnnouncedAtRef.current = Date.now()
      setAnnouncedWarning(liveWarning)
    }, waitMs)
    return () => clearTimeout(timer)
  }, [announcedWarning, liveWarning])

  useEffect(() => {
    if (!isActive || stream === undefined) {
      setStatus('idle')
      return
    }

    if (typeof WebAssembly === 'undefined') {
      setStatus('unsupported')
      onUnsupportedRef.current('noWasm')
      return
    }

    let isCancelled = false
    let timer: ReturnType<typeof setInterval> | undefined
    let engineTimeout: ReturnType<typeof setTimeout> | undefined
    let isBusy = false
    const canvas = document.createElement('canvas')
    const ownsWorker = borrowedWorker === undefined
    const worker =
      borrowedWorker ??
      new Worker(new URL('./boxDimension.worker.ts', import.meta.url), { type: 'module' })

    function releaseWorker(): void {
      worker.onmessage = null
      if (ownsWorker) worker.terminate()
    }

    function fail(reason: BoxDimensionUnsupportedReason): void {
      if (isCancelled) return
      isCancelled = true
      if (timer !== undefined) clearInterval(timer)
      if (engineTimeout !== undefined) clearTimeout(engineTimeout)
      releaseWorker()
      setStatus('unsupported')
      onUnsupportedRef.current(reason)
    }

    function scanFrame(): void {
      const frame = captureFrameStats(videoElementRef.current, canvas)
      if (frame === undefined) {
        isBusy = false
        return
      }
      const previousMarkerCorners = lastFrameRef.current?.markerCorners
      const request: BoxDimensionWorkerRequest = {
        height: frame.height,
        kind: 'frame',
        rgba: frame.rgba,
        width: frame.width,
        ...(previousMarkerCorners === undefined ? {} : { previousMarkerCorners }),
      }
      worker.postMessage(request, [frame.rgba.buffer])
    }

    worker.onmessage = (event: MessageEvent<BoxDimensionWorkerResponse>) => {
      const message = event.data
      if (message.kind === 'ready') {
        if (engineTimeout !== undefined) clearTimeout(engineTimeout)
        setStatus('live')
        timer = setInterval(() => {
          if (isBusy || isCancelled) return
          isBusy = true
          scanFrame()
        }, FRAME_INTERVAL_MS)
        return
      }
      if (message.kind === 'error') {
        fail(message.reason)
        return
      }
      isBusy = false
      lastFrameRef.current =
        message.markerCorners === undefined
          ? undefined
          : { frameStats: message.frameStats, markerCorners: message.markerCorners }
      setLiveFrameStats(message.frameStats)
      setLiveFrame({ height: message.frameStats.height, width: message.frameStats.width })
      slowFrameStrikesRef.current =
        message.elapsedMs > SLOW_FRAME_THRESHOLD_MS ? slowFrameStrikesRef.current + 1 : 0
      if (slowFrameStrikesRef.current >= SLOW_FRAME_STRIKES) fail('tooSlow')
    }

    function start(): void {
      setStatus('loadingEngine')
      engineTimeout = setTimeout(() => fail('engineFailed'), ENGINE_LOAD_TIMEOUT_MS)
      worker.postMessage({ kind: 'preload' } satisfies BoxDimensionWorkerRequest)
    }

    start()

    return () => {
      isCancelled = true
      if (timer !== undefined) clearInterval(timer)
      if (engineTimeout !== undefined) clearTimeout(engineTimeout)
      releaseWorker()
      revokeSnapshotObjectUrl()
    }
  }, [borrowedWorker, isActive, stream])

  /** `img-src` real não tem `data:` — revogar a URL de objeto é o par de cada criação. */
  function revokeSnapshotObjectUrl(): void {
    const objectUrl = snapshotObjectUrlRef.current
    if (objectUrl === undefined) return
    URL.revokeObjectURL(objectUrl)
    snapshotObjectUrlRef.current = undefined
  }

  /**
   * A foto congelada é um retrato próprio (`canvas.toBlob` + `URL.createObjectURL`), não o
   * `<video>` pausado: o navegador nem sempre mostra o quadro parado de forma estável, e o
   * retrato também alimenta a lupa sem precisar de um segundo `<video>` ligado à mesma trilha.
   * Nunca sai do aparelho — fica só em memória, como URL de objeto local. A URL de dados em base64
   * foi descartada porque a CSP real de produção não tem essa palavra em `img-src` (T14 item 1).
   */
  function captureFrame(): void {
    const video = videoElementRef.current
    const lastFrame = lastFrameRef.current
    if (video === null || lastFrame === undefined) return
    video.pause()
    const frame = frameSizeFor(video.videoWidth, video.videoHeight)
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    context?.drawImage(video, 0, 0, canvas.width, canvas.height)
    capturedRef.current = {
      frame,
      frameStats: lastFrame.frameStats,
      markerCorners: lastFrame.markerCorners,
    }
    setMarkedPoints(defaultMarkedPoints(frame))
    setStatus('capturing')
    if (context === null) {
      setSnapshotUrl(undefined)
      return
    }
    canvas.toBlob((blob) => {
      revokeSnapshotObjectUrl()
      if (blob === null) {
        setSnapshotUrl(undefined)
        return
      }
      const objectUrl = URL.createObjectURL(blob)
      snapshotObjectUrlRef.current = objectUrl
      setSnapshotUrl(objectUrl)
    }, 'image/png')
  }

  function returnToLive(): void {
    const video = videoElementRef.current
    capturedRef.current = undefined
    revokeSnapshotObjectUrl()
    setSnapshotUrl(undefined)
    if (video !== null) void video.play().catch(() => undefined)
    setStatus('live')
  }

  function setMarkedPoint(key: MarkedPointKey, point: Point): void {
    setMarkedPoints((current) => ({ ...current, [key]: point }))
  }

  function confirmMeasurement(): void {
    const captured = capturedRef.current
    if (captured === undefined) return
    const input = buildBoxMeasurementInput({
      facePoints: [markedPoints.a, markedPoints.b, markedPoints.c, markedPoints.d],
      footPoint: markedPoints.foot,
      frame: captured.frame,
      markerCorners: captured.markerCorners,
    })
    const nominal = measureBox(input)
    const margins = estimateMargins(input, nominal)
    /**
     * A3: as estatísticas são as do quadro **capturado**, não as do último quadro ao vivo, e o
     * ângulo sai da pose que acabou de ser resolvida — sem os dois, `steepAngle` e `unstable` nunca
     * chegavam ao histórico (T14 item A3).
     */
    const warnings = selectDomainWarnings(
      detectWarnings({
        ...captured.frameStats,
        markedPoints: [
          markedPoints.a,
          markedPoints.b,
          markedPoints.c,
          markedPoints.d,
          markedPoints.foot,
        ],
        markerCorners: captured.markerCorners,
        viewAngleDegrees: nominal.viewAngleDegrees,
      }),
    )
    setStatus('measured')
    onMeasuredRef.current(buildMeasuredProposal({ margins, nominal, warnings }))
  }

  return {
    announcedWarning,
    bounds: liveFrame,
    captureFrame,
    confirmMeasurement,
    snapshotUrl,
    liveWarnings,
    markedPoints,
    returnToLive,
    setMarkedPoint,
    status,
    videoRef,
  }
}

export { LIVE_WARNING_ANNOUNCE_INTERVAL_MS, MAXIMUM_FRAME_WIDTH }
