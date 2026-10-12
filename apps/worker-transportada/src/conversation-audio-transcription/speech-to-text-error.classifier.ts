/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  isRetriableTranscriptionFailure,
  TranscriptionRateLimitError,
  TranscriptionUnsupportedError,
} from '@adatechnology/audio-transcription-provider'

import { SPEECH_TO_TEXT_FAILURE_KIND } from './audio-transcription-engine.constant.js'
import { SpeechToTextError, type SpeechToTextFailure } from './speech-to-text.error.js'

const RETRIABLE_ENGINE_FAILED: SpeechToTextFailure = {
  code: 'engine_failed',
  kind: SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE,
}
const RETRIABLE_ENGINE_TIMEOUT: SpeechToTextFailure = {
  code: 'engine_timeout',
  kind: SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE,
}
const INFRASTRUCTURE_ENGINE_FAILED: SpeechToTextFailure = {
  code: 'engine_failed',
  kind: SPEECH_TO_TEXT_FAILURE_KIND.INFRASTRUCTURE,
}
const DEFINITIVE_ENGINE_FAILED: SpeechToTextFailure = {
  code: 'engine_failed',
  kind: SPEECH_TO_TEXT_FAILURE_KIND.DEFINITIVE,
}
const DEFINITIVE_UNSUPPORTED_FORMAT: SpeechToTextFailure = {
  code: 'unsupported_format',
  kind: SPEECH_TO_TEXT_FAILURE_KIND.DEFINITIVE,
}

/**
 * `execFile` mata o filho por prazo com `killed: true` na causa. O pacote carimba conversão que
 * estoura como definitiva (`isRetriable: false`), mas prazo vencido é retriável (contract.md §5.6).
 */
function isEngineTimeout(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('cause' in error)) return false
  const { cause } = error
  return typeof cause === 'object' && cause !== null && 'killed' in cause && cause.killed === true
}

/** O pacote embrulha `execFile` em `TranscriptionError`: binário ausente chega como `cause.code === 'ENOENT'`. */
function isMissingBinary(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('cause' in error)) return false
  const { cause } = error
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT'
}

/**
 * Tabela erro do pacote → falha do domínio. Devolve só `{ kind, code }`: a mensagem do erro
 * nunca sai daqui. Erro desconhecido é retriável (o pacote faz o mesmo); o limite é o de tentativas.
 */
export function classifySpeechToTextError(error: unknown): SpeechToTextFailure {
  if (error instanceof SpeechToTextError) return { code: error.code, kind: error.kind }
  if (error instanceof TranscriptionUnsupportedError) return DEFINITIVE_UNSUPPORTED_FORMAT
  if (error instanceof TranscriptionRateLimitError) return RETRIABLE_ENGINE_FAILED
  if (isEngineTimeout(error)) return RETRIABLE_ENGINE_TIMEOUT
  if (isMissingBinary(error)) return INFRASTRUCTURE_ENGINE_FAILED
  return isRetriableTranscriptionFailure(error) ? RETRIABLE_ENGINE_FAILED : DEFINITIVE_ENGINE_FAILED
}
