/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type { AudioTranscriptionFailureCode } from '../shared/conversation-audio-transcription.constant.js'
import type {
  LineOutcome,
  MeasuredDuration,
  ProcessLineParams,
} from './audio-transcription-line.types.js'
import { AUDIO_DOWNLOAD_TIMEOUT_MILLISECONDS } from './audio-transcription-runtime.constant.js'
import { normalizeTranscriptionText } from './audio-transcription-text.policy.js'
import { classifySpeechToTextError } from './speech-to-text-error.classifier.js'

type OutcomeParams = ProcessLineParams & { readonly measured: MeasuredDuration }

const OBJECT_STATUS_DELETED = 'deleted'
const OBJECT_STATUS_MISSING = 'missing'

function failed(code: AudioTranscriptionFailureCode): LineOutcome {
  return { audioDurationMs: null, code, kind: 'failed', maxDurationMs: null }
}

function sha256Hex(audio: Uint8Array): string {
  return createHash('sha256').update(audio).digest('hex')
}

function toPositiveOrNull(durationMs: number): number | null {
  return durationMs > 0 ? Math.round(durationMs) : null
}

async function measureAndTranscribe(
  params: OutcomeParams,
  bytes: Uint8Array,
): Promise<LineOutcome> {
  const { dependencies, line, measured, signal } = params
  const { maxDurationMilliseconds } = dependencies
  const audio = Buffer.from(bytes)
  const durationMs = await dependencies.durationProbe.measure({
    audio,
    maxDurationMilliseconds,
    signal,
  })
  measured.audioDurationMs = toPositiveOrNull(durationMs)
  if (durationMs >= maxDurationMilliseconds) {
    return {
      audioDurationMs: measured.audioDurationMs,
      code: 'too_long',
      kind: 'failed',
      maxDurationMs: maxDurationMilliseconds,
    }
  }

  const startedAt = dependencies.now().getTime()
  const result = await dependencies.speechToText.transcribe({
    audio,
    mimeType: line.mimeType,
    signal,
  })
  return {
    audioDurationMs: measured.audioDurationMs,
    engine: result.engine,
    kind: 'ready',
    language: result.language,
    processingMs: Math.max(0, dependencies.now().getTime() - startedAt),
    text: normalizeTranscriptionText(result.text),
  }
}

async function transcribeLine(params: OutcomeParams): Promise<LineOutcome> {
  const { dependencies, line, signal } = params
  if (!line.isCompanyEnabled) return failed('company_disabled')
  if (line.objectStatus === OBJECT_STATUS_DELETED) return { kind: 'purged' }
  if (line.objectStatus === OBJECT_STATUS_MISSING) return failed('object_missing')

  const downloadSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(AUDIO_DOWNLOAD_TIMEOUT_MILLISECONDS),
  ])
  const bytes = await dependencies.objectReader.read({
    bucket: line.bucket,
    key: line.objectKey,
    signal: downloadSignal,
  })
  if (bytes === undefined) return failed('object_missing')
  if (sha256Hex(bytes) !== line.sha256.toLowerCase()) return failed('sha256_mismatch')
  return measureAndTranscribe(params, bytes)
}

/** Erro de qualquer etapa vira `{ code, disposition }`: a mensagem do erro nunca sai daqui. */
export async function resolveLineOutcome(params: ProcessLineParams): Promise<LineOutcome> {
  const measured: MeasuredDuration = { audioDurationMs: null }
  try {
    return await transcribeLine({ ...params, measured })
  } catch (error: unknown) {
    const failure = classifySpeechToTextError(error)
    return {
      audioDurationMs: measured.audioDurationMs,
      code: failure.code,
      disposition: failure.kind,
      kind: 'error',
    }
  }
}
