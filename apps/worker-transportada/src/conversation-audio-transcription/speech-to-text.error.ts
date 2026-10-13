/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AudioTranscriptionFailureCode } from '../shared/conversation-audio-transcription.constant.js'
import type { SpeechToTextFailureKind } from './audio-transcription-engine.constant.js'

export type SpeechToTextFailure = {
  readonly kind: SpeechToTextFailureKind
  readonly code: AudioTranscriptionFailureCode
}

/** A mensagem é só o código: o erro do motor pode citar caminho de arquivo ou trecho do áudio. */
export class SpeechToTextError extends Error {
  override readonly name = 'SpeechToTextError'
  readonly kind: SpeechToTextFailureKind
  readonly code: AudioTranscriptionFailureCode

  constructor(failure: SpeechToTextFailure) {
    super(failure.code)
    this.kind = failure.kind
    this.code = failure.code
  }
}
