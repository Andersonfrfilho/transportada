/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const CONVERSATION_AUDIO_TRANSCRIBE_JOB = 'conversation.audio.transcribe' as const

/** Contract.md §5.6: a reivindicação filtra `attempts < 3`, e a varredura fecha `attempts >= 3`. */
export const AUDIO_TRANSCRIPTION_MAX_ATTEMPTS = 3

const MINUTE_MILLISECONDS = 60_000

/** Backoff por tentativa feita (1ª, 2ª, 3ª). A 3ª falha retriável esgota; o 30 só vale para quem pedir uma 4ª. */
export const AUDIO_TRANSCRIPTION_RETRY_DELAYS_MILLISECONDS = [
  MINUTE_MILLISECONDS,
  5 * MINUTE_MILLISECONDS,
  30 * MINUTE_MILLISECONDS,
] as const

/** Partes do lease da linha (contract.md §5.6, passo 4): o motor soma o timeout configurado. */
export const AUDIO_DOWNLOAD_TIMEOUT_MILLISECONDS = 60_000
export const AUDIO_LEASE_MARGIN_MILLISECONDS = 60_000

export const AUDIO_TRANSCRIBE_JOB_OUTCOME = {
  ALREADY_RUNNING: 'already_running',
  COMPLETED: 'completed',
  RUNNER_LOCK_EXPIRED: 'runner_lock_expired',
} as const

export const AUDIO_TRANSCRIPTION_LOG_MESSAGE = {
  CYCLE_FINISHED: 'audio_transcription_cycle_finished',
  LINE_FAILED: 'audio_transcription_line_failed',
  LINE_FINISHED: 'audio_transcription_line_finished',
  LINE_OWNERSHIP_LOST: 'audio_transcription_line_ownership_lost',
  RUNNER_FAILED: 'audio_transcription_runner_failed',
  RUNNER_LOCK_EXPIRED: 'audio_transcription_runner_lock_expired',
  RUNNER_RELEASE_FAILED: 'audio_transcription_runner_release_failed',
} as const

/** Falha que não é alerta: a empresa desligou, e isso é escolha dela (contract.md §5.7). */
export const AUDIO_TRANSCRIPTION_NON_ALERT_FAILURE_CODE = 'company_disabled'
