/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'

import type { BarcodeFrame } from './barcodeDecoder.service'
import type { BarcodeWorkerAnswer } from './barcodeDecoder.worker'
import {
  createNativeBarcodeDetector,
  openCameraStream,
  stopCameraStream,
  toLuminance,
  type NativeBarcodeDetector,
} from './barcodeScanner.service'

const FRAME_INTERVAL_MS = 250
const MAXIMUM_FRAME_WIDTH = 720

export type BarcodeScannerStatus = 'denied' | 'idle' | 'reading' | 'starting' | 'unavailable'

export type UseBarcodeScannerParams = Readonly<{
  isActive: boolean
  onRead: (text: string) => void
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

    let isCancelled = false
    let openedStream: unknown
    let worker: Worker | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    let isBusy = false
    const canvas = document.createElement('canvas')

    function announce(text: string | null): void {
      isBusy = false
      if (text === null || text === '' || isCancelled) return
      isCancelled = true
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

    async function start(): Promise<void> {
      setStatus('starting')
      const result = await openCameraStream(globalThis.navigator)
      if (isCancelled || result.status !== 'ready') {
        if (result.status === 'ready') stopCameraStream(result.stream)
        else setStatus(result.status)
        return
      }
      openedStream = result.stream
      const video = videoRef.current
      if (video === null) return
      video.srcObject = result.stream as unknown as MediaStream
      await video.play().catch(() => undefined)
      if (isCancelled) return
      setStatus('reading')

      const detector = createNativeBarcodeDetector(globalThis)
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
      stopCameraStream(openedStream)
      const video = videoRef.current
      if (video !== null) video.srcObject = null
    }
  }, [isActive])

  return { status, videoRef }
}
