/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AudioTranscriptionLineQueuePort } from './audio-transcription-queue.port.js'
import type { AudioTranscriptionDatabase } from './drizzle-audio-transcription-cycle.repository.js'
import { claimNextAudioTranscription } from './drizzle-audio-transcription-line-claim.repository.js'
import {
  markAudioTranscriptionFailed,
  markAudioTranscriptionReady,
  releaseAudioTranscription,
  scheduleAudioTranscriptionRetry,
} from './drizzle-audio-transcription-line-write.repository.js'

export function createDrizzleAudioTranscriptionLineQueue(
  database: AudioTranscriptionDatabase,
): AudioTranscriptionLineQueuePort {
  return {
    claimNext: (params) => claimNextAudioTranscription(database, params),
    markFailed: (params) => markAudioTranscriptionFailed(database, params),
    markReady: (params) => markAudioTranscriptionReady(database, params),
    release: (params) => releaseAudioTranscription(database, params),
    scheduleRetry: (params) => scheduleAudioTranscriptionRetry(database, params),
  }
}
