/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  AudioTranscriptionLineKey,
  AudioTranscriptionLineQueuePort,
} from './audio-transcription-queue.port.js'
import type { LineOutcome, ProcessLineParams } from './audio-transcription-line.types.js'
import { SPEECH_TO_TEXT_FAILURE_KIND } from './audio-transcription-engine.constant.js'
import {
  hasExhaustedAttempts,
  resolveRetryDelayMilliseconds,
} from './audio-transcription-retry.policy.js'
import {
  AUDIO_TRANSCRIPTION_INFRASTRUCTURE_RETRY_DELAY_MILLISECONDS,
  AUDIO_TRANSCRIPTION_NON_ALERT_FAILURE_CODE,
} from './audio-transcription-runtime.constant.js'
import {
  AUDIO_TRANSCRIPTION_LINE_STATE,
  type AudioTranscriptionLineResult,
} from './audio-transcription-summary.js'

type PersistParams = ProcessLineParams & { readonly outcome: LineOutcome }
type ErrorOutcome = Extract<LineOutcome, { kind: 'error' }>

/** `undefined` é a escrita que não achou o `lease_token`: outra execução ficou com a posse da linha. */
type Persisted = AudioTranscriptionLineResult | undefined

function toResult(isOwner: boolean, result: AudioTranscriptionLineResult): Persisted {
  return isOwner ? result : undefined
}

function toFailureState(code: string): AudioTranscriptionLineResult['state'] {
  return code === AUDIO_TRANSCRIPTION_NON_ALERT_FAILURE_CODE
    ? AUDIO_TRANSCRIPTION_LINE_STATE.COMPANY_DISABLED
    : AUDIO_TRANSCRIPTION_LINE_STATE.FAILED
}

async function markDisabled(
  queue: AudioTranscriptionLineQueuePort,
  key: AudioTranscriptionLineKey,
): Promise<Persisted> {
  const isOwner = await queue.markFailed({
    ...key,
    audioDurationMs: null,
    code: 'company_disabled',
    maxDurationMs: null,
  })
  return toResult(isOwner, {
    code: 'company_disabled',
    state: AUDIO_TRANSCRIPTION_LINE_STATE.COMPANY_DISABLED,
  })
}

/** `markReady` recusa se a empresa desligou no meio: o texto não é gravado, e a linha fecha `company_disabled`. */
async function persistReady(
  params: PersistParams,
  key: AudioTranscriptionLineKey,
): Promise<Persisted> {
  const { dependencies, outcome } = params
  const { queue } = dependencies
  const ready =
    outcome.kind === 'ready'
      ? { ...key, ...outcome, model: dependencies.model }
      : {
          ...key,
          audioDurationMs: null,
          engine: null,
          language: null,
          model: null,
          processingMs: null,
          text: null,
        }
  const state =
    outcome.kind === 'ready'
      ? AUDIO_TRANSCRIPTION_LINE_STATE.READY
      : AUDIO_TRANSCRIPTION_LINE_STATE.PURGED
  if (await queue.markReady(ready)) return { state }
  return markDisabled(queue, key)
}

async function persistError(
  params: PersistParams,
  key: AudioTranscriptionLineKey,
  outcome: ErrorOutcome,
): Promise<Persisted> {
  const { dependencies, line } = params
  const { queue } = dependencies
  const base = { ...key, audioDurationMs: outcome.audioDurationMs }
  if (outcome.disposition === SPEECH_TO_TEXT_FAILURE_KIND.INFRASTRUCTURE) {
    const isOwner = await queue.scheduleRetry({
      ...base,
      delayMilliseconds: AUDIO_TRANSCRIPTION_INFRASTRUCTURE_RETRY_DELAY_MILLISECONDS,
      shouldGiveBackAttempt: true,
    })
    return toResult(isOwner, {
      code: outcome.code,
      state: AUDIO_TRANSCRIPTION_LINE_STATE.INFRASTRUCTURE,
    })
  }
  const isRetriable = outcome.disposition === SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE
  if (isRetriable && !hasExhaustedAttempts(line.attempts)) {
    const isOwner = await queue.scheduleRetry({
      ...base,
      delayMilliseconds: resolveRetryDelayMilliseconds(line.attempts),
      shouldGiveBackAttempt: false,
    })
    return toResult(isOwner, { code: outcome.code, state: AUDIO_TRANSCRIPTION_LINE_STATE.RETRIED })
  }
  const code = isRetriable ? 'attempts_exhausted' : outcome.code
  const isOwner = await queue.markFailed({ ...base, code, maxDurationMs: null })
  return toResult(isOwner, { code, state: toFailureState(code) })
}

async function persistFailed(
  params: PersistParams,
  key: AudioTranscriptionLineKey,
  outcome: Extract<LineOutcome, { kind: 'failed' }>,
): Promise<Persisted> {
  const isOwner = await params.dependencies.queue.markFailed({
    ...key,
    audioDurationMs: outcome.audioDurationMs,
    code: outcome.code,
    maxDurationMs: outcome.maxDurationMs,
  })
  return toResult(isOwner, { code: outcome.code, state: toFailureState(outcome.code) })
}

export async function persistLineOutcome(params: PersistParams): Promise<Persisted> {
  const { line, outcome } = params
  const key = { id: line.id, leaseToken: line.leaseToken }
  if (outcome.kind === 'ready' || outcome.kind === 'purged') return persistReady(params, key)
  if (outcome.kind === 'failed') return persistFailed(params, key, outcome)
  return persistError(params, key, outcome)
}
