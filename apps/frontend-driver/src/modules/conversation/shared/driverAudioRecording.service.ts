/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantAudioRecordingOptions } from '@adatechnology/conversations-ui/participant'

import {
  captureRegistry,
  type CaptureRegistry,
} from '@/modules/driver-trip/shared/captureRegistry.service'

/** Só baixam o padrão do pacote (5 min e 16 MiB, a política de áudio da API): o motorista manda recado, não reunião. */
export const DRIVER_AUDIO_RECORDING_LIMITS = {
  maxDurationMs: 2 * 60 * 1000,
  maxSizeBytes: 8 * 1024 * 1024,
} as const

/** A gravação aberta segura a atualização do app e a volta da rede: navegar jogaria o áudio fora. */
export function createDriverAudioRecordingOptions(
  registry: Pick<CaptureRegistry, 'close' | 'open'>,
): ParticipantAudioRecordingOptions {
  let isOpen = false
  return {
    ...DRIVER_AUDIO_RECORDING_LIMITS,
    onCaptureChange(isCapturing) {
      if (isCapturing === isOpen) return
      isOpen = isCapturing
      if (isCapturing) registry.open('audio-recording')
      else registry.close('audio-recording')
    },
  }
}

/** Identidade estável entre renders: o pacote não deve ver opções novas a cada render da página. */
export const driverAudioRecordingOptions = createDriverAudioRecordingOptions(captureRegistry)
