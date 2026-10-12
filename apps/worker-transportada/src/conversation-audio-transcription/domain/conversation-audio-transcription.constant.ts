/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const AUDIO_TRANSCRIPTION_JOB = 'conversation.audio.transcribe' as const

export const TRANSCRIPTION_STATUS = {
  FAILED: 'failed',
  PENDING: 'pending',
  PURGED: 'purged',
  READY: 'ready',
} as const

/** Contract §5.5: lista fechada de `failure_code`, a mesma do CHECK da tabela. */
export const TRANSCRIPTION_FAILURE_CODES = [
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
export type TranscriptionFailureCode = (typeof TRANSCRIPTION_FAILURE_CODES)[number]

/** Contract §5.6 passo 4: `attempts` sobe na reivindicação, e a reivindicação filtra `attempts < 3`. */
export const TRANSCRIPTION_MAX_ATTEMPTS = 3

/** Contract §5.6 passo 6: backoff conforme `attempts` (1ª, 2ª tentativa); a 3ª esgota. */
export const TRANSCRIPTION_BACKOFF_MINUTES = [1, 5, 30] as const

/** Contract §5.5: 20 000 code points (`char_length`), cortados em fronteira de palavra. */
export const TRANSCRIPTION_TEXT_MAX_CODE_POINTS = 20_000

/** Contract §5.6 passo 5: cada etapa tem prazo próprio, e o lease cobre a soma delas. */
export const AUDIO_PROBE_TIMEOUT_MS = 15_000
export const AUDIO_DECODE_TIMEOUT_MS = 60_000
export const AUDIO_DOWNLOAD_TIMEOUT_MS = 60_000
export const AUDIO_LEASE_MARGIN_MS = 60_000

export const AUDIO_LANGUAGE_HINT = 'pt'

/** Janela do marco "sem backfill" é lida do ambiente; este é só o formato do prazo. */
export const MILLISECONDS_PER_HOUR = 3_600_000

export const RUNNER_OUTCOME = {
  ALREADY_RUNNING: 'already_running',
  COMPLETED: 'completed',
  RUNNER_LOCK_EXPIRED: 'runner_lock_expired',
} as const

export function computeAudioLeaseMs(engineTimeoutMs: number): number {
  // O motor usa o prazo duas vezes por áudio: `ffmpeg` converte para WAV e `whisper-cli` transcreve.
  return (
    2 * engineTimeoutMs +
    AUDIO_PROBE_TIMEOUT_MS +
    AUDIO_DECODE_TIMEOUT_MS +
    AUDIO_DOWNLOAD_TIMEOUT_MS +
    AUDIO_LEASE_MARGIN_MS
  )
}

export function resolveBackoffMinutes(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1), TRANSCRIPTION_BACKOFF_MINUTES.length) - 1
  return TRANSCRIPTION_BACKOFF_MINUTES[index] ?? TRANSCRIPTION_BACKOFF_MINUTES[0]
}
