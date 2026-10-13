/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type SpeechToTextParams = {
  readonly audio: Buffer
  readonly mimeType: string
  readonly signal?: AbortSignal
}

export type SpeechToTextResult = {
  readonly text: string
  readonly engine: string
  /** A dica pedida ao motor, não detecção de idioma. */
  readonly language: string
}

/** Falha do motor chega como `SpeechToTextError` (retriável ou definitiva), nunca como erro cru do pacote. */
export type SpeechToText = {
  transcribe(params: SpeechToTextParams): Promise<SpeechToTextResult>
}
