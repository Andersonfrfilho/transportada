/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CaptureRegistry } from '@/modules/driver-trip/shared/captureRegistry.service'

/** O SDK avisa `true` de pedir o microfone até sair da revisão; aviso repetido não empilha captura. */
export function createAudioCaptureBridge(
  registry: Pick<CaptureRegistry, 'close' | 'open'>,
): (isCapturing: boolean) => void {
  let isOpen = false
  return (isCapturing) => {
    if (isCapturing === isOpen) return
    isOpen = isCapturing
    if (isCapturing) registry.open('audio')
    else registry.close('audio')
  }
}
