/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AudioTranscriptionLineQueuePort } from './audio-transcription-queue.port.js'
import type { AudioTranscriptionLineKey } from './audio-transcription-queue.port.js'
import {
  hasExhaustedAttempts,
  resolveRetryDelayMilliseconds,
} from './audio-transcription-retry.policy.js'
import { AUDIO_TRANSCRIPTION_NON_ALERT_FAILURE_CODE } from './audio-transcription-runtime.constant.js'
import {
  AUDIO_TRANSCRIPTION_LINE_STATE,
  type AudioTranscriptionLineResult,
} from './audio-transcription-summary.js'
import type { LineOutcome, ProcessLineParams } from './audio-transcription-line.types.js'

type PersistParams = ProcessLineParams & { readonly outcome: LineOutcome }

/** `undefined` é a escrita que não achou o `lease_token`: outra execução ficou com a posse da linha. */
type Persisted = AudioTranscriptionLineResult | undefined

function toResult(isOwner: boolean, result: AudioTranscriptionLineResult): Persisted {
  return isOwner ? result : undefined
}

async function persistReady(
  queue: AudioTranscriptionLineQueuePort,
  key: AudioTranscriptionLineKey,
  params: PersistParams,
): Promise<Persisted> {
  const { outcome } = params
  if (outcome.kind === 'purged') {
    const isOwner = await queue.markReady({
      ...key,
      audioDurationMs: null,
      engine: null,
      language: null,
      model: null,
      processingMs: null,
      text: null,
    })
    return toResult(isOwner, { state: AUDIO_TRANSCRIPTION_LINE_STATE.PURGED })
  }
  if (outcome.kind !== 'ready') return undefined
  const model = params.dependencies.model
  const isOwner = await queue.markReady({ ...key, ...outcome, model })
  return toResult(isOwner, { state: AUDIO_TRANSCRIPTION_LINE_STATE.READY })
}

async function persistFailure(
  queue: AudioTranscriptionLineQueuePort,
  key: AudioTranscriptionLineKey,
  outcome: Exclude<LineOutcome, { kind: 'ready' | 'purged' }>,
  isExhausted: boolean,
): Promise<Persisted> {
  const isFailedOutcome = outcome.kind === 'failed'
  const code =
    outcome.kind === 'error' && outcome.isRetriable && isExhausted
      ? 'attempts_exhausted'
      : outcome.code
  const isOwner = await queue.markFailed({
    ...key,
    audioDurationMs: isFailedOutcome ? outcome.audioDurationMs : null,
    code,
    maxDurationMs: isFailedOutcome ? outcome.maxDurationMs : null,
  })
  const isDisabled = code === AUDIO_TRANSCRIPTION_NON_ALERT_FAILURE_CODE
  return toResult(isOwner, {
    code,
    state: isDisabled
      ? AUDIO_TRANSCRIPTION_LINE_STATE.COMPANY_DISABLED
      : AUDIO_TRANSCRIPTION_LINE_STATE.FAILED,
  })
}

export async function persistLineOutcome(params: PersistParams): Promise<Persisted> {
  const { dependencies, line, outcome } = params
  const key = { id: line.id, leaseToken: line.leaseToken }
  if (outcome.kind === 'ready' || outcome.kind === 'purged') {
    return persistReady(dependencies.queue, key, params)
  }

  const isExhausted = hasExhaustedAttempts(line.attempts)
  if (outcome.kind === 'error' && outcome.isRetriable && !isExhausted) {
    const delayMilliseconds = resolveRetryDelayMilliseconds(line.attempts)
    const isOwner = await dependencies.queue.scheduleRetry({ ...key, delayMilliseconds })
    return toResult(isOwner, { code: outcome.code, state: AUDIO_TRANSCRIPTION_LINE_STATE.RETRIED })
  }
  return persistFailure(dependencies.queue, key, outcome, isExhausted)
}
