/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AttachmentObjectReaderPort } from '../aggregate-attachment/application/extract-attachment-fields.port.js'
import type { AudioTranscriptionFailureCode } from '../shared/conversation-audio-transcription.constant.js'
import type { WorkerLogger } from '../shared/worker.types.js'
import type { AudioDurationProbe } from './audio-duration-probe.port.js'
import type {
  AudioTranscriptionLineQueuePort,
  ClaimedAudioTranscription,
} from './audio-transcription-queue.port.js'
import type { SpeechToText } from './speech-to-text.port.js'

export type AudioTranscriptionLineDependencies = {
  readonly queue: AudioTranscriptionLineQueuePort
  readonly objectReader: AttachmentObjectReaderPort
  readonly durationProbe: AudioDurationProbe
  readonly speechToText: SpeechToText
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly maxDurationMilliseconds: number
  readonly model: string
}

export type ProcessLineParams = {
  readonly dependencies: AudioTranscriptionLineDependencies
  readonly line: ClaimedAudioTranscription
  readonly signal: AbortSignal
}

/** O que a linha virou antes de gravar; `error` ainda precisa decidir entre tentar de novo e fechar. */
export type LineOutcome =
  | {
      readonly kind: 'ready'
      readonly text: string
      readonly language: string
      readonly engine: string
      readonly audioDurationMs: number | null
      readonly processingMs: number
    }
  | { readonly kind: 'purged' }
  | {
      readonly kind: 'failed'
      readonly code: AudioTranscriptionFailureCode
      readonly audioDurationMs: number | null
      readonly maxDurationMs: number | null
    }
  | {
      readonly kind: 'error'
      readonly isRetriable: boolean
      readonly code: AudioTranscriptionFailureCode
    }
