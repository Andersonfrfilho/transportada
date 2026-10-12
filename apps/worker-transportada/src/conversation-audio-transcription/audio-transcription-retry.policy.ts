/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  FFPROBE_TIMEOUT_MILLISECONDS,
  DURATION_DECODE_TIMEOUT_MILLISECONDS,
} from './audio-transcription-engine.constant.js'
import {
  AUDIO_DOWNLOAD_TIMEOUT_MILLISECONDS,
  AUDIO_LEASE_MARGIN_MILLISECONDS,
  AUDIO_TRANSCRIPTION_MAX_ATTEMPTS,
  AUDIO_TRANSCRIPTION_RETRY_DELAYS_MILLISECONDS,
} from './audio-transcription-runtime.constant.js'

/** Cobre todas as etapas da linha: sem isso o lease venceria na 3ª tentativa e o resultado bom seria descartado. */
export function computeLeaseMilliseconds(engineTimeoutMilliseconds: number): number {
  return (
    engineTimeoutMilliseconds +
    FFPROBE_TIMEOUT_MILLISECONDS +
    DURATION_DECODE_TIMEOUT_MILLISECONDS +
    AUDIO_DOWNLOAD_TIMEOUT_MILLISECONDS +
    AUDIO_LEASE_MARGIN_MILLISECONDS
  )
}

export function resolveRetryDelayMilliseconds(attempts: number): number {
  const index =
    Math.min(Math.max(attempts, 1), AUDIO_TRANSCRIPTION_RETRY_DELAYS_MILLISECONDS.length) - 1
  return AUDIO_TRANSCRIPTION_RETRY_DELAYS_MILLISECONDS[index] ?? 0
}

export function hasExhaustedAttempts(attempts: number): boolean {
  return attempts >= AUDIO_TRANSCRIPTION_MAX_ATTEMPTS
}

/** Idade máxima da trava do executor: um lote inteiro de linhas, cada uma com o lease dela. */
export function computeRunnerLockMaxAgeMilliseconds(params: {
  readonly batchSize: number
  readonly leaseMilliseconds: number
}): number {
  return params.batchSize * params.leaseMilliseconds
}
