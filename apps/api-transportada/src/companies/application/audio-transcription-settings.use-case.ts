/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 RF17: a empresa liga ou desliga a transcrição dos áudios das conversas. O teto de duração
 * vem do ambiente e só é lido.
 */
import type {
  AudioTranscriptionSettings,
  AudioTranscriptionSettingsPort,
  SaveAudioTranscriptionSettingsParams,
} from './audio-transcription-settings.port.js'

type Dependencies = {
  readonly maxDurationMs: number
  readonly settings: AudioTranscriptionSettingsPort
}

export function createGetAudioTranscriptionSettingsUseCase(dependencies: Dependencies): {
  readonly execute: (params: { readonly companyId: string }) => Promise<AudioTranscriptionSettings>
} {
  return {
    execute: async (params) => ({
      ...(await dependencies.settings.find({ companyId: params.companyId })),
      maxDurationMs: dependencies.maxDurationMs,
    }),
  }
}

export function createSaveAudioTranscriptionSettingsUseCase(dependencies: Dependencies): {
  readonly execute: (
    params: SaveAudioTranscriptionSettingsParams,
  ) => Promise<AudioTranscriptionSettings>
} {
  return {
    execute: async (params) => ({
      ...(await dependencies.settings.save(params)),
      maxDurationMs: dependencies.maxDurationMs,
    }),
  }
}
