/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3 (contract.md §5.6, passos 4-8): o que uma linha reivindicada vira, com transcritor,
 * sonda e leitor de objeto falsos. O SQL da posse e das escritas é provado em `test/integration/`.
 */
import { describe, expect, test } from 'bun:test'

import {
  processAudioTranscriptionLine,
  type AudioTranscriptionLineDependencies,
} from '../../src/conversation-audio-transcription/audio-transcription-line.processor.js'
import { SPEECH_TO_TEXT_FAILURE_KIND } from '../../src/conversation-audio-transcription/audio-transcription-engine.constant.js'
import { SpeechToTextError } from '../../src/conversation-audio-transcription/speech-to-text.error.js'
import type { SpeechToText } from '../../src/conversation-audio-transcription/speech-to-text.port.js'
import {
  AUDIO_BYTES,
  buildFakeRow,
  createFakeClock,
  createFakeLineQueue,
  createFixedProbe,
  createInstantTranscriber,
  createLogCapture,
  createMapReader,
  type FakeRow,
} from '../fixtures/audio-transcription-harness.fixture.js'

const MAX_DURATION_MS = 600_000
const MINUTE = 60_000

type Options = {
  readonly row?: Partial<FakeRow>
  readonly transcriber?: SpeechToText
  readonly probe?: ReturnType<typeof createFixedProbe>
  readonly objects?: Record<string, Uint8Array | undefined>
}

async function processOne(options: Options = {}) {
  const clock = createFakeClock()
  const row = buildFakeRow(options.row)
  const queue = createFakeLineQueue([row], clock)
  const transcriber = options.transcriber ?? createInstantTranscriber()
  const logs = createLogCapture()
  const dependencies: AudioTranscriptionLineDependencies = {
    durationProbe: options.probe ?? createFixedProbe(5_000),
    logger: logs.logger,
    maxDurationMilliseconds: MAX_DURATION_MS,
    model: 'small-q5_1',
    now: clock.now,
    objectReader: createMapReader(options.objects ?? { 'object-1': AUDIO_BYTES }),
    queue,
    speechToText: transcriber,
  }
  const claimed = await queue.claimNext({ leaseMilliseconds: 495_000 })
  if (claimed === undefined) throw new Error('row was not claimable')
  const result = await processAudioTranscriptionLine({
    dependencies,
    line: claimed,
    signal: new AbortController().signal,
  })
  return { clock, logs, result, row, transcriber }
}

function failing(error: unknown): SpeechToText {
  return { transcribe: async () => Promise.reject(error) }
}

describe('audio transcription line processing (spec 264 T3.3)', () => {
  test('a good audio becomes ready with the text, generated once', async () => {
    const { result, row } = await processOne()
    expect(result.state).toBe('ready')
    expect(row.status).toBe('ready')
    expect(row.text).toContain('motorista')
    expect(row.audioDurationMs).toBe(5_000)
  })

  test('a text with U+0000 is stored without it', async () => {
    const { row } = await processOne({ transcriber: createInstantTranscriber('ola\u0000 mundo') })
    expect(row.text).toBe('ola mundo')
  })

  test('a duration at the ceiling is too long, and the transcriber is never called', async () => {
    const transcriber = createInstantTranscriber()
    const { result, row } = await processOne({
      probe: createFixedProbe(MAX_DURATION_MS),
      transcriber,
    })
    expect(result).toEqual({ code: 'too_long', state: 'failed' })
    expect(row.failureCode).toBe('too_long')
    expect(row.maxDurationMs).toBe(MAX_DURATION_MS)
    expect(transcriber.calls).toBe(0)
  })

  test('one millisecond under the ceiling is still transcribed', async () => {
    const transcriber = createInstantTranscriber()
    const { result } = await processOne({
      probe: createFixedProbe(MAX_DURATION_MS - 1),
      transcriber,
    })
    expect(result.state).toBe('ready')
    expect(transcriber.calls).toBe(1)
  })

  test('a disabled company closes without the engine and outside the alert', async () => {
    const transcriber = createInstantTranscriber()
    const { logs, result, row } = await processOne({
      row: { isCompanyEnabled: false },
      transcriber,
    })
    expect(result).toEqual({ code: 'company_disabled', state: 'company_disabled' })
    expect(row.failureCode).toBe('company_disabled')
    expect(transcriber.calls).toBe(0)
    expect(logs.lines.filter((line) => line.level === 'error')).toHaveLength(0)
  })

  test('a different sha256 is a definitive sha256_mismatch', async () => {
    const { result, row } = await processOne({ row: { sha256: 'f'.repeat(64) } })
    expect(result).toEqual({ code: 'sha256_mismatch', state: 'failed' })
    expect(row.status).toBe('failed')
  })

  test('a missing object is object_missing', async () => {
    const { result } = await processOne({ objects: {} })
    expect(result).toEqual({ code: 'object_missing', state: 'failed' })
  })

  test('a deleted object is purged: ready without text, no download and no engine', async () => {
    const transcriber = createInstantTranscriber()
    const { result, row } = await processOne({
      objects: {},
      row: { objectStatus: 'deleted' },
      transcriber,
    })
    expect(result.state).toBe('purged')
    expect(row.status).toBe('ready')
    expect(row.text).toBeNull()
    expect(transcriber.calls).toBe(0)
  })

  test('a retriable engine failure goes back to pending with the 1 minute backoff', async () => {
    const error = new SpeechToTextError({
      code: 'engine_timeout',
      kind: SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE,
    })
    const { clock, result, row } = await processOne({ transcriber: failing(error) })
    expect(result.state).toBe('retried')
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.nextAttemptAtMs).toBe(clock.now().getTime() + MINUTE)
  })

  test('the second failure waits 5 minutes and the third exhausts the attempts', async () => {
    const error = new SpeechToTextError({
      code: 'engine_failed',
      kind: SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE,
    })
    const second = await processOne({ row: { attempts: 1 }, transcriber: failing(error) })
    expect(second.row.nextAttemptAtMs).toBe(second.clock.now().getTime() + 5 * MINUTE)
    const third = await processOne({ row: { attempts: 2 }, transcriber: failing(error) })
    expect(third.result).toEqual({ code: 'attempts_exhausted', state: 'failed' })
    expect(third.row.failureCode).toBe('attempts_exhausted')
  })

  test('a definitive failure closes with its own code, without retrying', async () => {
    const error = new SpeechToTextError({
      code: 'unsupported_format',
      kind: SPEECH_TO_TEXT_FAILURE_KIND.DEFINITIVE,
    })
    const { result, row } = await processOne({ transcriber: failing(error) })
    expect(result).toEqual({ code: 'unsupported_format', state: 'failed' })
    expect(row.status).toBe('failed')
  })

  test('an ffprobe or ffmpeg timeout is retriable and counts the attempt', async () => {
    const timeout = new SpeechToTextError({
      code: 'engine_timeout',
      kind: SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE,
    })
    const { result, row } = await processOne({ probe: createFixedProbe(timeout) })
    expect(result.state).toBe('retried')
    expect(row.attempts).toBe(1)
  })

  test('an unknown error is retriable too, and the third one still exhausts', async () => {
    const { result } = await processOne({
      row: { attempts: 2 },
      transcriber: failing(new Error('boom')),
    })
    expect(result).toEqual({ code: 'attempts_exhausted', state: 'failed' })
  })

  test('a result written by someone who lost the lease is discarded', async () => {
    const clock = createFakeClock()
    const row = buildFakeRow()
    const queue = createFakeLineQueue([row], clock)
    const stolen = createInstantTranscriber()
    const claimed = await queue.claimNext({ leaseMilliseconds: 1_000 })
    if (claimed === undefined) throw new Error('not claimed')
    Object.assign(row, { leaseToken: 'someone-else' })
    const logs = createLogCapture()
    const result = await processAudioTranscriptionLine({
      dependencies: {
        durationProbe: createFixedProbe(1_000),
        logger: logs.logger,
        maxDurationMilliseconds: MAX_DURATION_MS,
        model: 'm',
        now: clock.now,
        objectReader: createMapReader({ 'object-1': AUDIO_BYTES }),
        queue,
        speechToText: stolen,
      },
      line: claimed,
      signal: new AbortController().signal,
    })
    expect(result.state).toBe('ownership_lost')
    expect(row.status).toBe('pending')
    expect(row.text).toBeUndefined()
  })
})
