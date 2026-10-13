/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Arranjo comum dos contratos de processamento de uma linha da transcrição (spec 264 T3.3).
 */
import {
  processAudioTranscriptionLine,
  type AudioTranscriptionLineDependencies,
} from '../../src/conversation-audio-transcription/audio-transcription-line.processor.js'
import type { AudioObjectReader } from '../../src/conversation-audio-transcription/audio-object-reader.port.js'
import type { SpeechToText } from '../../src/conversation-audio-transcription/speech-to-text.port.js'
import {
  AUDIO_BYTES,
  createFixedProbe,
  createInstantTranscriber,
  createLogCapture,
  createMapReader,
} from '../fixtures/audio-transcription-doubles.fixture.js'
import {
  buildFakeRow,
  createFakeClock,
  createFakeLineQueue,
  type FakeRow,
} from '../fixtures/audio-transcription-harness.fixture.js'

export const MAX_DURATION_MS = 600_000
export const MINUTE = 60_000

export type ProcessOptions = {
  readonly row?: Partial<FakeRow>
  readonly transcriber?: SpeechToText
  readonly probe?: ReturnType<typeof createFixedProbe>
  readonly objects?: Record<string, Uint8Array | undefined>
  readonly reader?: AudioObjectReader
  readonly signal?: AbortSignal
  /** Outra execução ficou com a posse depois da reivindicação. */
  readonly shouldStealLease?: boolean
}

export async function processOne(options: ProcessOptions = {}) {
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
    objectReader: options.reader ?? createMapReader(options.objects ?? { 'object-1': AUDIO_BYTES }),
    queue,
    speechToText: transcriber,
  }
  const claimed = await queue.claimNext({ leaseMilliseconds: 495_000 })
  if (claimed === undefined) throw new Error('row was not claimable')
  if (options.shouldStealLease === true) Object.assign(row, { leaseToken: 'someone-else' })
  const result = await processAudioTranscriptionLine({
    dependencies,
    line: claimed,
    signal: options.signal ?? new AbortController().signal,
  })
  return { clock, logs, result, row, transcriber }
}

export function failing(error: unknown): SpeechToText {
  return { transcribe: async () => Promise.reject(error) }
}
