/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `apps/api-transportada/src/shared/conversation-audio-transcription.constant.ts` (spec 264 T3.1).
 * `test/occurrence-conversation/audio-transcription-schema-parity.contract.ts` reprova se o código divergir.
 */

/** `disabled` não entra aqui de propósito: é derivado da configuração da empresa, nunca gravado (contract.md §5.5). */
export const AUDIO_TRANSCRIPTION_STATUSES = ['pending', 'ready', 'failed'] as const
export type AudioTranscriptionStatus = (typeof AUDIO_TRANSCRIPTION_STATUSES)[number]

/** RF14 da spec 264, mais `company_disabled` (contract.md §5.7). Lista fechada no banco. */
export const AUDIO_TRANSCRIPTION_FAILURE_CODES = [
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
export type AudioTranscriptionFailureCode = (typeof AUDIO_TRANSCRIPTION_FAILURE_CODES)[number]

/** Code points, não unidades UTF-16: o CHECK usa `char_length` (contract.md §5.5). */
export const AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS = 20_000

/** Teto de duração do áudio transcrito (contract.md §5.1): só leitura na API, o mesmo valor do worker. */
export const AUDIO_TRANSCRIPTION_DEFAULT_MAX_DURATION_MS = 600_000
