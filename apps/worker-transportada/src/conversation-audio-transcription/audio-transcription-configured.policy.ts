/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AudioTranscriptionEnvironment, WorkerEnvironment } from '../shared/worker.types.js'

/** RF16: sem `AUDIO_TRANSCRIPTION_MODEL_PATH` a rotina não é registrada. */
export function isAudioTranscriptionConfigured(
  environment: WorkerEnvironment,
): environment is WorkerEnvironment & {
  readonly audioTranscription: AudioTranscriptionEnvironment
} {
  return environment.audioTranscription !== undefined
}
