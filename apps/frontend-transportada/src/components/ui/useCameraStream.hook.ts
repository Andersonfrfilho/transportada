/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import { openCameraStream, stopCameraStream, type MediaStreamLike } from './barcodeScanner.service'

export type CameraStreamStatus = 'denied' | 'idle' | 'ready' | 'starting' | 'unavailable'

export type UseCameraStreamParams = Readonly<{
  isActive: boolean
}>

export type CameraStreamController = Readonly<{
  status: CameraStreamStatus
  stream: MediaStreamLike | undefined
}>

/**
 * Dono único do `getUserMedia`: abre uma vez por ativação e entrega o mesmo `MediaStream` para
 * quem hospeda (etiqueta e, depois, medida), em vez de cada etapa pedir permissão de novo (D19).
 */
export function useCameraStream({ isActive }: UseCameraStreamParams): CameraStreamController {
  const [status, setStatus] = useState<CameraStreamStatus>('idle')
  const [stream, setStream] = useState<MediaStreamLike | undefined>(undefined)

  useEffect(() => {
    if (!isActive) {
      setStatus('idle')
      setStream(undefined)
      return
    }

    let isCancelled = false
    let openedStream: MediaStreamLike | undefined

    async function start(): Promise<void> {
      setStatus('starting')
      const result = await openCameraStream(globalThis.navigator)
      if (isCancelled) {
        if (result.status === 'ready') stopCameraStream(result.stream)
        return
      }
      if (result.status !== 'ready') {
        setStatus(result.status)
        return
      }
      openedStream = result.stream
      setStream(result.stream)
      setStatus('ready')
    }

    void start()

    return () => {
      isCancelled = true
      stopCameraStream(openedStream)
      setStream(undefined)
    }
  }, [isActive])

  return { status, stream }
}
