/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const SPEECH_TO_TEXT_FAILURE_KIND = {
  DEFINITIVE: 'definitive',
  RETRIABLE: 'retriable',
} as const
export type SpeechToTextFailureKind =
  (typeof SPEECH_TO_TEXT_FAILURE_KIND)[keyof typeof SPEECH_TO_TEXT_FAILURE_KIND]

/** Contract.md §5.6: `ffprobe` e a decodificação de reserva têm prazo próprio sobre arquivo que pode ser hostil. */
export const FFPROBE_TIMEOUT_MILLISECONDS = 15_000
export const DURATION_DECODE_TIMEOUT_MILLISECONDS = 60_000

/** A decodificação para em `teto + 1 s`: basta para saber que passou do teto, sem decodificar o arquivo todo. */
export const DURATION_DECODE_MARGIN_MILLISECONDS = 1_000

export const DEFAULT_FFPROBE_BINARY = 'ffprobe'
export const DEFAULT_FFMPEG_BINARY = 'ffmpeg'
