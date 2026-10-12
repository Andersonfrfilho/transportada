/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264: o vocabulário gravado da transcrição de áudio da conversa. `disabled` não está aqui: é derivado
 * na leitura da configuração da empresa (D4/D9), nunca gravado.
 */
export const CONVERSATION_AUDIO_TRANSCRIPTION_STATUS = {
  FAILED: 'failed',
  PENDING: 'pending',
  PURGED: 'purged',
  READY: 'ready',
} as const
export type ConversationAudioTranscriptionStatus =
  (typeof CONVERSATION_AUDIO_TRANSCRIPTION_STATUS)[keyof typeof CONVERSATION_AUDIO_TRANSCRIPTION_STATUS]

export const CONVERSATION_AUDIO_TRANSCRIPTION_STATUSES = [
  CONVERSATION_AUDIO_TRANSCRIPTION_STATUS.PENDING,
  CONVERSATION_AUDIO_TRANSCRIPTION_STATUS.READY,
  CONVERSATION_AUDIO_TRANSCRIPTION_STATUS.FAILED,
  CONVERSATION_AUDIO_TRANSCRIPTION_STATUS.PURGED,
] as const

/** RF14 + `company_disabled` (contract.md §5.7). */
export const CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES = [
  'unsupported_format',
  'too_long',
  'empty_audio',
  'object_missing',
  'sha256_mismatch',
  'engine_timeout',
  'engine_failed',
  'attempts_exhausted',
  'company_disabled',
] as const
export type ConversationAudioTranscriptionFailureCode =
  (typeof CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES)[number]

/** 20 000 code points (`char_length`); o worker corta por code point antes de gravar. */
export const CONVERSATION_AUDIO_TRANSCRIPTION_TEXT_MAX_LENGTH = 20_000
