/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type { AudioTranscriptionFailureCode } from '../shared/conversation-audio-transcription.constant.js'
import { SPEECH_TO_TEXT_FAILURE_KIND } from './audio-transcription-engine.constant.js'
import type { LineOutcome, ProcessLineParams } from './audio-transcription-line.types.js'
import { normalizeTranscriptionText } from './audio-transcription-text.policy.js'
import { classifySpeechToTextError } from './speech-to-text-error.classifier.js'

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
  params: ProcessLineParams,
  bytes: Uint8Array,
): Promise<LineOutcome> {
  const { dependencies, line, signal } = params
  const { maxDurationMilliseconds } = dependencies
  const audio = Buffer.from(bytes)
  const durationMs = await dependencies.durationProbe.measure({ audio, maxDurationMilliseconds })
  if (durationMs >= maxDurationMilliseconds) {
    return {
      audioDurationMs: toPositiveOrNull(durationMs),
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
    audioDurationMs: toPositiveOrNull(durationMs),
    engine: result.engine,
    kind: 'ready',
    language: result.language,
    processingMs: Math.max(0, dependencies.now().getTime() - startedAt),
    text: normalizeTranscriptionText(result.text),
  }
}

async function transcribeLine(params: ProcessLineParams): Promise<LineOutcome> {
  const { dependencies, line } = params
  if (!line.isCompanyEnabled) return failed('company_disabled')
  if (line.objectStatus === 'deleted') return { kind: 'purged' }

  const bytes = await dependencies.objectReader.read({ bucket: line.bucket, key: line.objectKey })
  if (bytes === undefined) return failed('object_missing')
  if (sha256Hex(bytes) !== line.sha256.toLowerCase()) return failed('sha256_mismatch')
  return measureAndTranscribe(params, bytes)
}

/** Erro de qualquer etapa vira `{ code, isRetriable }`: a mensagem do erro nunca sai daqui. */
export async function resolveLineOutcome(params: ProcessLineParams): Promise<LineOutcome> {
  try {
    return await transcribeLine(params)
  } catch (error: unknown) {
    const failure = classifySpeechToTextError(error)
    return {
      code: failure.code,
      isRetriable: failure.kind === SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE,
      kind: 'error',
    }
  }
}
