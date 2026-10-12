/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TranscriptionFailureCode } from '../domain/conversation-audio-transcription.constant.js'

export type SpeechToTextInput = Readonly<{
  bytes: Uint8Array
  languageHint: string
  mimeType: string
  signal: AbortSignal
}>

export type SpeechToTextResult = Readonly<{
  engine: string
  language: string
  model: string | null
  text: string
}>

export type SpeechToTextPort = {
  transcribe(input: SpeechToTextInput): Promise<SpeechToTextResult>
}

/**
 * Só o código e se vale tentar de novo — nunca a mensagem do erro de origem, que pode citar caminho
 * de arquivo (spec 264 D8).
 */
export class SpeechToTextError extends Error {
  readonly failureCode: TranscriptionFailureCode
  readonly isRetriable: boolean

  constructor(params: {
    readonly failureCode: TranscriptionFailureCode
    readonly isRetriable: boolean
  }) {
    super(params.failureCode)
    this.name = 'SpeechToTextError'
    this.failureCode = params.failureCode
    this.isRetriable = params.isRetriable
  }
}

/** Medida de duração (`ffprobe`, com decodificação como reserva). */
export type AudioDurationMeterPort = {
  /** `undefined` quando não foi possível medir nem decodificando (arquivo sem áudio). */
  measure(input: {
    readonly bytes: Uint8Array
    readonly maxDurationMs: number
    readonly mimeType: string
  }): Promise<number | undefined>
}

/** O arquivo travou o `ffprobe`/`ffmpeg`: retriável, conta tentativa (contract §5.6 passo 5). */
export class AudioMeasureTimeoutError extends Error {
  constructor() {
    super('audio_measure_timeout')
    this.name = 'AudioMeasureTimeoutError'
  }
}

export type AudioObjectReaderPort = {
  /** `undefined` quando o objeto não existe mais no bucket. */
  read(location: { readonly bucket: string; readonly key: string }): Promise<Uint8Array | undefined>
}
