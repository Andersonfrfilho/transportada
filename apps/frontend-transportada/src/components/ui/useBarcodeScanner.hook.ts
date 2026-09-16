/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'

import type { BarcodeFrame } from './barcodeDecoder.service'
import type { BarcodeWorkerAnswer } from './barcodeDecoder.worker'
import {
  createNativeBarcodeDetector,
  openCameraStream,
  stopCameraStream,
  toLuminance,
  type MediaStreamLike,
  type NativeBarcodeDetector,
} from './barcodeScanner.service'

const FRAME_INTERVAL_MS = 250
const MAXIMUM_FRAME_WIDTH = 720
/**
 * A etiqueta continua parada na frente da câmera por vários quadros depois de lida uma vez — sem
 * este intervalo o mesmo texto reanunciaria a cada 250ms. Curto o bastante para o operador poder
 * escanear a caixa seguinte sem esperar.
 */
const REPEAT_ANNOUNCE_COOLDOWN_MS = 1500

export type BarcodeScannerStatus = 'denied' | 'idle' | 'reading' | 'starting' | 'unavailable'

export type UseBarcodeScannerParams = Readonly<{
  isActive: boolean
  onRead: (text: string) => void
  /**
   * Sessão de câmera já aberta por `useCameraStream` (D19) — o leitor não pede `getUserMedia` de
   * novo nem fecha essa trilha ao sair; quem abriu decide quando fechar. Sem `stream`, mantém o
   * comportamento anterior: abre e fecha a própria câmera (spec 055 e outros usos do leitor).
   */
  stream?: MediaStreamLike | undefined
}>

export type BarcodeScannerController = Readonly<{
  status: BarcodeScannerStatus
  videoRef: React.RefObject<HTMLVideoElement | null>
}>

function captureFrame(
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement,
): BarcodeFrame | undefined {
  if (video === null || video.videoWidth === 0 || video.videoHeight === 0) return undefined
  const factor = Math.min(1, MAXIMUM_FRAME_WIDTH / video.videoWidth)
  const width = Math.round(video.videoWidth * factor)
  const height = Math.round(video.videoHeight * factor)
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) return undefined
  context.drawImage(video, 0, 0, width, height)
  return { height, luminance: toLuminance(context.getImageData(0, 0, width, height).data), width }
}

export function useBarcodeScanner({
  isActive,
  onRead,
  stream,
}: UseBarcodeScannerParams): BarcodeScannerController {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const onReadRef = useRef(onRead)
  const [status, setStatus] = useState<BarcodeScannerStatus>('idle')

  useEffect(() => {
    onReadRef.current = onRead
  }, [onRead])

  useEffect(() => {
    if (!isActive) {
      setStatus('idle')
      return
    }

    /** Sem `stream` injetado, o leitor continua dono do próprio ciclo de abrir/fechar a câmera. */
    const ownsStream = stream === undefined
    let isCancelled = false
    let openedStream: unknown
    let worker: Worker | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    let isBusy = false
    let lastAnnouncedText: string | undefined
    let lastAnnouncedAt = 0
    const canvas = document.createElement('canvas')

    /**
     * ⚠️ Não cancela mais o laço no primeiro acerto — quem decide se a leitura serve (achou a
     * caixa na fila ou não) é o módulo que hospeda o leitor, e ele pode querer continuar lendo
     * quando a etiqueta não corresponde a nada. O primitivo só evita anunciar o mesmo texto duas
     * vezes seguidas enquanto a etiqueta segue na frente da câmera.
     */
    function announce(text: string | null): void {
      isBusy = false
      if (text === null || text === '' || isCancelled) return
      const now = Date.now()
      if (text === lastAnnouncedText && now - lastAnnouncedAt < REPEAT_ANNOUNCE_COOLDOWN_MS) return
      lastAnnouncedText = text
      lastAnnouncedAt = now
      onReadRef.current(text)
    }

    function scanWithWorker(): void {
      const frame = captureFrame(videoRef.current, canvas)
      if (frame === undefined || worker === undefined) {
        isBusy = false
        return
      }
      worker.postMessage(frame, [frame.luminance.buffer])
    }

    async function scanWithDetector(detector: NativeBarcodeDetector): Promise<void> {
      const video = videoRef.current
      if (video === null) {
        isBusy = false
        return
      }
      try {
        const found = await detector.detect(video)
        announce(found[0]?.rawValue ?? null)
      } catch {
        isBusy = false
      }
    }

    async function attachStream(mediaStream: unknown): Promise<boolean> {
      const video = videoRef.current
      if (video === null) return false
      video.srcObject = mediaStream as MediaStream
      await video.play().catch(() => undefined)
      return !isCancelled
    }

    async function start(): Promise<void> {
      setStatus('starting')
      if (ownsStream) {
        const result = await openCameraStream(globalThis.navigator)
        if (isCancelled || result.status !== 'ready') {
          if (result.status === 'ready') stopCameraStream(result.stream)
          else setStatus(result.status)
          return
        }
        openedStream = result.stream
        if (!(await attachStream(result.stream))) return
      } else if (!(await attachStream(stream))) {
        return
      }
      setStatus('reading')

      const detector = await createNativeBarcodeDetector(globalThis)
      if (isCancelled) return
      if (detector === undefined) {
        worker = new Worker(new URL('./barcodeDecoder.worker.ts', import.meta.url), {
          type: 'module',
        })
        worker.onmessage = (event: MessageEvent<BarcodeWorkerAnswer>) => announce(event.data.text)
      }
      timer = setInterval(() => {
        if (isBusy || isCancelled) return
        isBusy = true
        if (detector === undefined) scanWithWorker()
        else void scanWithDetector(detector)
      }, FRAME_INTERVAL_MS)
    }

    void start()

    return () => {
      isCancelled = true
      if (timer !== undefined) clearInterval(timer)
      worker?.terminate()
      /** O stream injetado tem dono fora deste hook — só a trilha aberta aqui mesmo é encerrada. */
      if (ownsStream) stopCameraStream(openedStream)
      const video = videoRef.current
      if (video !== null) video.srcObject = null
    }
  }, [isActive, stream])

  return { status, videoRef }
}
