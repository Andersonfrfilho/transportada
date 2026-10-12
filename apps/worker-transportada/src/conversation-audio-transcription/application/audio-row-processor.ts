/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  AUDIO_LANGUAGE_HINT,
  TRANSCRIPTION_MAX_ATTEMPTS,
  TRANSCRIPTION_TEXT_MAX_CODE_POINTS,
  resolveBackoffMinutes,
  type TranscriptionFailureCode,
} from '../domain/conversation-audio-transcription.constant.js'
import type {
  AudioTranscriptionQueuePort,
  ClaimedTranscription,
} from './audio-transcription-queue.port.js'
import {
  AudioMeasureTimeoutError,
  SpeechToTextError,
  type AudioDurationMeterPort,
  type AudioObjectReaderPort,
  type SpeechToTextPort,
} from './speech-to-text.port.js'

export type AudioRowOutcome = 'failed' | 'lost_lease' | 'purged' | 'ready' | 'released' | 'retry'

export type AudioRowProcessorPort = {
  process(params: {
    readonly claimed: ClaimedTranscription
    readonly signal: AbortSignal
  }): Promise<AudioRowOutcome>
}

export type AudioRowProcessorDependencies = {
  readonly logger: WorkerLogger
  readonly maxDurationMs: number
  readonly meter: AudioDurationMeterPort
  readonly now: () => Date
  readonly objectReader: AudioObjectReaderPort
  readonly queue: AudioTranscriptionQueuePort
  readonly speechToText: SpeechToTextPort
}

type Failure = Readonly<{ code: TranscriptionFailureCode; isRetriable: boolean }>

/** Passos 5–6 do contract §5.6: tudo que acontece a uma linha, sempre escrito com o `lease_token`. */
export function createAudioRowProcessor(
  dependencies: AudioRowProcessorDependencies,
): AudioRowProcessorPort {
  return { process: (params) => processRow({ ...params, dependencies }) }
}

type ProcessParams = {
  readonly claimed: ClaimedTranscription
  readonly dependencies: AudioRowProcessorDependencies
  readonly signal: AbortSignal
}

async function processRow(params: ProcessParams): Promise<AudioRowOutcome> {
  const { claimed, dependencies, signal } = params
  const { queue } = dependencies
  const lease = { id: claimed.id, leaseToken: claimed.leaseToken }

  if (signal.aborted) return conclude(params, 'released', await queue.release(lease))

  if (!(await queue.isCompanyEnabled(claimed.companyId))) {
    return conclude(
      params,
      'failed',
      await queue.writeFailed({ ...lease, failureCode: 'company_disabled' }),
    )
  }
  if (claimed.objectDeleted) {
    return conclude(params, 'purged', await queue.writePurged(lease))
  }

  const startedAt = dependencies.now()
  const outcome = await transcribeObject(params)
  if (outcome.kind === 'failure') return settleFailure(params, outcome)

  const text = cleanTranscriptionText(outcome.text)
  if (text === '') {
    return conclude(
      params,
      'failed',
      await queue.writeFailed({
        ...lease,
        durationMs: outcome.durationMs,
        failureCode: 'empty_audio',
      }),
    )
  }

  return conclude(
    params,
    'ready',
    await queue.writeReady({
      ...lease,
      durationMs: outcome.durationMs,
      engine: outcome.engine,
      language: AUDIO_LANGUAGE_HINT,
      model: outcome.model,
      processingMs: Math.max(0, dependencies.now().getTime() - startedAt.getTime()),
      text,
    }),
  )
}

type TranscribeOutcome =
  | (Failure & Readonly<{ durationMs?: number; kind: 'failure'; maxDurationMs?: number }>)
  | Readonly<{
      durationMs: number
      engine: string
      kind: 'transcribed'
      model: string | null
      text: string
    }>

async function transcribeObject(params: ProcessParams): Promise<TranscribeOutcome> {
  const { claimed, dependencies, signal } = params
  try {
    const bytes = await dependencies.objectReader.read({
      bucket: claimed.bucket,
      key: claimed.objectKey,
    })
    if (bytes === undefined) return failure('object_missing', false)
    if (sha256Hex(bytes) !== claimed.sha256.toLowerCase()) return failure('sha256_mismatch', false)

    const durationMs = await dependencies.meter.measure({
      bytes,
      maxDurationMs: dependencies.maxDurationMs,
      mimeType: claimed.contentType,
    })
    if (durationMs === undefined) {
      return failure(bytes.byteLength === 0 ? 'empty_audio' : 'unsupported_format', false)
    }
    if (durationMs >= dependencies.maxDurationMs) {
      return {
        code: 'too_long',
        durationMs,
        isRetriable: false,
        kind: 'failure',
        maxDurationMs: dependencies.maxDurationMs,
      }
    }

    const result = await dependencies.speechToText.transcribe({
      bytes,
      languageHint: AUDIO_LANGUAGE_HINT,
      mimeType: claimed.contentType,
      signal,
    })
    return {
      durationMs,
      engine: result.engine,
      kind: 'transcribed',
      model: result.model,
      text: result.text,
    }
  } catch (error) {
    return classify(error)
  }
}

function failure(code: TranscriptionFailureCode, isRetriable: boolean): TranscribeOutcome {
  return { code, isRetriable, kind: 'failure' }
}

function classify(error: unknown): TranscribeOutcome {
  if (error instanceof SpeechToTextError) return failure(error.failureCode, error.isRetriable)
  if (error instanceof AudioMeasureTimeoutError) return failure('engine_timeout', true)
  return failure('engine_failed', true)
}

async function settleFailure(
  params: ProcessParams,
  outcome: Extract<TranscribeOutcome, { kind: 'failure' }>,
): Promise<AudioRowOutcome> {
  const { claimed, dependencies, signal } = params
  const { queue } = dependencies
  const lease = { id: claimed.id, leaseToken: claimed.leaseToken }

  if (signal.aborted) return conclude(params, 'released', await queue.release(lease))

  const exhausted = outcome.isRetriable && claimed.attempts >= TRANSCRIPTION_MAX_ATTEMPTS
  if (outcome.isRetriable && !exhausted) {
    return conclude(
      params,
      'retry',
      await queue.scheduleRetry({
        ...lease,
        backoffMinutes: resolveBackoffMinutes(claimed.attempts),
      }),
      outcome.code,
    )
  }

  const failureCode = exhausted ? 'attempts_exhausted' : outcome.code
  return conclude(
    params,
    'failed',
    await queue.writeFailed({
      ...lease,
      ...(outcome.durationMs === undefined ? {} : { durationMs: outcome.durationMs }),
      failureCode,
      ...(outcome.maxDurationMs === undefined ? {} : { maxDurationMs: outcome.maxDurationMs }),
    }),
    failureCode,
  )
}

/** `owned = false` é posse perdida: o resultado é descartado e nada mais é escrito. */
function conclude(
  params: ProcessParams,
  outcome: AudioRowOutcome,
  owned: boolean,
  failureCode?: TranscriptionFailureCode,
): AudioRowOutcome {
  const { claimed, dependencies } = params
  if (!owned) {
    safeLogWarn({
      logger: dependencies.logger,
      message: 'audio_transcription_lease_lost',
      metadata: { attachmentId: claimed.attachmentId, transcriptionId: claimed.id },
    })
    return 'lost_lease'
  }
  safeLogInfo({
    logger: dependencies.logger,
    message: 'audio_transcription_row_finished',
    metadata: {
      attempts: claimed.attempts,
      attachmentId: claimed.attachmentId,
      outcome,
      transcriptionId: claimed.id,
      ...(failureCode === undefined ? {} : { failureCode }),
    },
  })
  return outcome
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** O `text` do Postgres recusa NUL; o corte é por code point e, se couber, em fronteira de palavra. */
function cleanTranscriptionText(raw: string): string {
  const cleaned = raw.replaceAll('\u0000', '').trim()
  const codePoints = Array.from(cleaned)
  if (codePoints.length <= TRANSCRIPTION_TEXT_MAX_CODE_POINTS) return cleaned

  const head = codePoints.slice(0, TRANSCRIPTION_TEXT_MAX_CODE_POINTS)
  const nextIsSpace = /\s/u.test(codePoints[TRANSCRIPTION_TEXT_MAX_CODE_POINTS] ?? ' ')
  if (nextIsSpace) return head.join('').trimEnd()
  const lastSpace = head.findLastIndex((character) => /\s/u.test(character))
  return (lastSpace > 0 ? head.slice(0, lastSpace) : head).join('').trimEnd()
}
