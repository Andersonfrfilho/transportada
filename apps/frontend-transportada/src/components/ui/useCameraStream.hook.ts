/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import {
  countVideoInputDevices,
  DEFAULT_CAMERA_FACING_MODE,
  openCameraStream,
  stopCameraStream,
  type CameraFacingMode,
  type MediaStreamLike,
} from './barcodeScanner.service'

export type CameraStreamStatus = 'denied' | 'idle' | 'ready' | 'starting' | 'unavailable'

export type UseCameraStreamParams = Readonly<{
  /** Qual câmera abrir. Trocar o valor reabre a sessão na outra câmera. */
  facingMode?: CameraFacingMode
  isActive: boolean
}>

export type CameraStreamController = Readonly<{
  /** `true` só quando o aparelho tem mais de uma câmera — o botão de virar não aparece sem isso. */
  hasMultipleCameras: boolean
  /** `true` só quando a trilha ativa expõe `torch` em `getCapabilities()` (spec 152, caso extremo). */
  hasTorch: boolean
  status: CameraStreamStatus
  stream: MediaStreamLike | undefined
  /** Sem `hasTorch`, é um no-op seguro — nenhum consumidor precisa checar antes de chamar. */
  toggleTorch: () => void
  torchOn: boolean
}>

/** Só os métodos que a lanterna usa — o resto da trilha real (`MediaStreamTrack`) segue opaco aqui. */
type TorchCapableTrack = Readonly<{
  applyConstraints: (
    constraints: Readonly<{ advanced: readonly Record<string, unknown>[] }>,
  ) => Promise<void>
  getCapabilities?: () => Readonly<{ torch?: boolean }>
  stop: () => void
}>

function firstTrack(stream: MediaStreamLike | undefined): TorchCapableTrack | undefined {
  const [track] = stream?.getTracks() ?? []
  return track as TorchCapableTrack | undefined
}

/**
 * Dono único do `getUserMedia`: abre uma vez por ativação e entrega o mesmo `MediaStream` para
 * quem hospeda (etiqueta e, depois, medida), em vez de cada etapa pedir permissão de novo (D19).
 * A lanterna (spec 152, "casos extremos") é do mesmo dono: só a etapa Medida a usa, mas ligar e
 * apagar a trilha certa exige saber qual trilha é a ativa agora.
 */
export function useCameraStream({
  facingMode = DEFAULT_CAMERA_FACING_MODE,
  isActive,
}: UseCameraStreamParams): CameraStreamController {
  const [status, setStatus] = useState<CameraStreamStatus>('idle')
  const [stream, setStream] = useState<MediaStreamLike | undefined>(undefined)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)

  useEffect(() => {
    if (!isActive) {
      setStatus('idle')
      setStream(undefined)
      setHasTorch(false)
      setTorchOn(false)
      return
    }

    let isCancelled = false
    let openedStream: MediaStreamLike | undefined

    async function start(): Promise<void> {
      setStatus('starting')
      const result = await openCameraStream(globalThis.navigator, facingMode)
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
      setHasTorch(firstTrack(result.stream)?.getCapabilities?.()?.torch === true)
      // A contagem vem depois de a permissão existir: antes dela o Safari esconde as entradas.
      const cameras = await countVideoInputDevices(globalThis.navigator)
      if (!isCancelled) setHasMultipleCameras(cameras > 1)
    }

    void start()

    return () => {
      isCancelled = true
      stopCameraStream(openedStream)
      setStream(undefined)
      setHasTorch(false)
      setTorchOn(false)
    }
  }, [facingMode, isActive])

  function toggleTorch(): void {
    const track = firstTrack(stream)
    if (!hasTorch || track === undefined) return
    const next = !torchOn
    void track.applyConstraints({ advanced: [{ torch: next }] }).then(
      () => setTorchOn(next),
      () => undefined,
    )
  }

  return { hasMultipleCameras, hasTorch, status, stream, toggleTorch, torchOn }
}
