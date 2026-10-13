/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Arranjo comum dos contratos do executor da transcrição (spec 264 T3.3).
 */
import { createAudioTranscriptionRunner } from '../../src/conversation-audio-transcription/audio-transcription.runner.js'
import type { AudioTranscriptionLineQueuePort } from '../../src/conversation-audio-transcription/audio-transcription-queue.port.js'
import {
  AUDIO_BYTES,
  createFixedProbe,
  createHeldTranscriber,
  createLogCapture,
  createMapReader,
} from '../fixtures/audio-transcription-doubles.fixture.js'
import {
  createFakeClock,
  createFakeLineQueue,
  type FakeRow,
} from '../fixtures/audio-transcription-harness.fixture.js'

export const LEASE_MS = 495_000
export const LOCK_MAX_AGE_MS = 990_000

export function buildRunner(options: {
  readonly rows: FakeRow[]
  readonly batchSize?: number
  readonly transcriber?: ReturnType<typeof createHeldTranscriber>
  readonly wrapQueue?: (queue: AudioTranscriptionLineQueuePort) => AudioTranscriptionLineQueuePort
}) {
  const clock = createFakeClock()
  const logs = createLogCapture()
  const transcriber = options.transcriber ?? createHeldTranscriber()
  const baseQueue = createFakeLineQueue(options.rows, clock)
  const runner = createAudioTranscriptionRunner({
    batchSize: options.batchSize ?? 2,
    leaseMilliseconds: LEASE_MS,
    line: {
      durationProbe: createFixedProbe(2_000),
      logger: logs.logger,
      maxDurationMilliseconds: 600_000,
      model: 'small-q5_1',
      now: clock.now,
      objectReader: createMapReader({ 'object-1': AUDIO_BYTES }),
      queue: options.wrapQueue?.(baseQueue) ?? baseQueue,
      speechToText: transcriber,
    },
    lockMaxAgeMilliseconds: LOCK_MAX_AGE_MS,
  })
  return { baseQueue, clock, logs, runner, transcriber }
}
