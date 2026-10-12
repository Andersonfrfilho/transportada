/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (contract.md §5.1): a empresa liga e desliga a transcrição dos áudios da conversa. A API grava a
 * decisão; quem transcreve é a rotina do worker.
 */
import type {
  AudioTranscriptionActor,
  AudioTranscriptionSettings,
  AudioTranscriptionSettingsPort,
} from './audio-transcription-settings.port.js'

type Dependencies = { readonly settings: AudioTranscriptionSettingsPort }

export function createGetAudioTranscriptionSettingsUseCase(dependencies: Dependencies): {
  readonly execute: (input: { readonly companyId: string }) => Promise<AudioTranscriptionSettings>
} {
  return { execute: (input) => dependencies.settings.find({ companyId: input.companyId }) }
}

export function createSaveAudioTranscriptionSettingsUseCase(dependencies: Dependencies): {
  readonly execute: (
    input: AudioTranscriptionActor & { readonly enabled: boolean },
  ) => Promise<AudioTranscriptionSettings>
} {
  return { execute: (input) => dependencies.settings.save(input) }
}
