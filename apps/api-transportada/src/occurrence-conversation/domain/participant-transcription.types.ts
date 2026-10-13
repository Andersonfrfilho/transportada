/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  PARTICIPANT_TRANSCRIPTION_FAILURE_REASON,
  PARTICIPANT_TRANSCRIPTION_STATUS,
} from './participant-transcription.constant.js'

/** A linha de `occurrence_conversation_audio_transcriptions` como o mapper precisa dela. */
export type TranscriptionRowInput = {
  readonly engine: null | string
  readonly failureCode: null | string
  readonly generatedAt: Date | null
  readonly language: null | string
  readonly maxDurationMs: null | number
  readonly status: string
  readonly text: null | string
}

export type ToParticipantTranscriptionParams = {
  readonly isEnabled: boolean
  readonly row: TranscriptionRowInput | undefined
}

export type ParticipantTranscription =
  | { readonly status: typeof PARTICIPANT_TRANSCRIPTION_STATUS.PENDING }
  | { readonly status: typeof PARTICIPANT_TRANSCRIPTION_STATUS.DISABLED }
  | {
      readonly engine?: string
      readonly generatedAt: string
      readonly language?: string
      readonly status: typeof PARTICIPANT_TRANSCRIPTION_STATUS.READY
      readonly text: string
    }
  | {
      readonly maxDurationMs: number
      readonly reason: typeof PARTICIPANT_TRANSCRIPTION_FAILURE_REASON.TOO_LONG
      readonly status: typeof PARTICIPANT_TRANSCRIPTION_STATUS.FAILED
    }

export type ResolveAudioDurationParams = {
  readonly attachmentDurationMs: null | number | undefined
  readonly transcriptionDurationMs: null | number | undefined
}
