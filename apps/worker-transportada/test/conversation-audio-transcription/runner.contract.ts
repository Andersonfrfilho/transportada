/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3 (contract.md §5.8): o executor em processo, com trava de uma execução.
 */
import { describe, expect, test } from 'bun:test'

import {
  AUDIO_TRANSCRIPTION_RUNNER_START,
  createAudioTranscriptionRunner,
} from '../../src/conversation-audio-transcription/audio-transcription.runner.js'
import type { AudioTranscriptionLineQueuePort } from '../../src/conversation-audio-transcription/audio-transcription-queue.port.js'
import {
  AUDIO_BYTES,
  buildFakeRow,
  createFakeClock,
  createFakeLineQueue,
  createFixedProbe,
  createHeldTranscriber,
  createLogCapture,
  createMapReader,
  flushMicrotasks,
  type FakeRow,
} from '../fixtures/audio-transcription-harness.fixture.js'

const LEASE_MS = 495_000
const LOCK_MAX_AGE_MS = 990_000

function buildRunner(options: {
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

describe('audio transcription runner (spec 264 T3.3)', () => {
  test('one execution at a time: the second start does not open another', async () => {
    const { runner, transcriber } = buildRunner({
      rows: [buildFakeRow(), buildFakeRow({ id: 'two' })],
    })
    expect(runner.start()).toBe(AUDIO_TRANSCRIPTION_RUNNER_START.STARTED)
    await flushMicrotasks()
    expect(runner.isRunning()).toBe(true)
    expect(runner.start()).toBe(AUDIO_TRANSCRIPTION_RUNNER_START.ALREADY_RUNNING)
    expect(transcriber.calls).toBe(1)
    transcriber.finish()
    await flushMicrotasks()
    transcriber.finish()
    await flushMicrotasks()
    expect(runner.isRunning()).toBe(false)
  })

  test('processes one line at a time up to the batch size and leaves the rest', async () => {
    const rows = [buildFakeRow({ id: 'a' }), buildFakeRow({ id: 'b' }), buildFakeRow({ id: 'c' })]
    const { runner, transcriber } = buildRunner({ batchSize: 2, rows })
    runner.start()
    await flushMicrotasks()
    expect(transcriber.calls).toBe(1)
    transcriber.finish()
    await flushMicrotasks()
    expect(transcriber.calls).toBe(2)
    transcriber.finish()
    await flushMicrotasks()
    expect(rows.map((row) => row.status)).toEqual(['ready', 'ready', 'pending'])
    expect(runner.takeSummary()).toMatchObject({ processed: 2, ready: 2, runnerError: 0 })
  })

  test('hands the summary of the finished execution over once, then zeroes it', async () => {
    const { runner, transcriber } = buildRunner({ rows: [buildFakeRow()] })
    expect(runner.takeSummary()).toBeUndefined()
    runner.start()
    await flushMicrotasks()
    expect(runner.takeSummary()).toBeUndefined()
    transcriber.finish()
    await flushMicrotasks()
    expect(runner.takeSummary()).toMatchObject({ failed: 0, processed: 1, ready: 1 })
    expect(runner.takeSummary()).toBeUndefined()
  })

  test('a stale lock is released with an error log and the next start runs a new execution', async () => {
    const { clock, logs, runner, transcriber } = buildRunner({
      rows: [buildFakeRow(), buildFakeRow({ id: 'two' })],
    })
    runner.start()
    await flushMicrotasks()
    clock.advance(LOCK_MAX_AGE_MS)
    expect(runner.start()).toBe(AUDIO_TRANSCRIPTION_RUNNER_START.ALREADY_RUNNING)
    clock.advance(1)
    expect(runner.start()).toBe(AUDIO_TRANSCRIPTION_RUNNER_START.LOCK_EXPIRED)
    expect(
      logs.lines.some(
        (line) =>
          line.level === 'error' && line.message === 'audio_transcription_runner_lock_expired',
      ),
    ).toBe(true)
    expect(runner.isRunning()).toBe(false)
    await flushMicrotasks()
    expect(runner.start()).toBe(AUDIO_TRANSCRIPTION_RUNNER_START.STARTED)
    expect(transcriber.calls).toBeGreaterThanOrEqual(1)
  })

  test('an error thrown outside a line ends the execution with runnerError and no loose rejection', async () => {
    const rejections: unknown[] = []
    const onRejection = (reason: unknown): void => void rejections.push(reason)
    process.on('unhandledRejection', onRejection)
    const { runner } = buildRunner({
      rows: [buildFakeRow()],
      wrapQueue: (queue) => ({
        ...queue,
        claimNext: async () => Promise.reject(new Error('database went away')),
      }),
    })
    runner.start()
    await flushMicrotasks()
    process.off('unhandledRejection', onRejection)
    expect(rejections).toEqual([])
    expect(runner.takeSummary()).toMatchObject({ processed: 0, runnerError: 1 })
    expect(runner.isRunning()).toBe(false)
  })

  test('an engine that throws never becomes a loose rejection either', async () => {
    const { runner, transcriber } = buildRunner({ rows: [buildFakeRow()] })
    runner.start()
    await flushMicrotasks()
    transcriber.fail(new Error('whisper exploded'))
    await flushMicrotasks()
    expect(runner.takeSummary()).toMatchObject({ processed: 1, retried: 1, runnerError: 0 })
  })

  test('close() returns the in-flight line to pending with the attempt given back', async () => {
    const rows = [buildFakeRow()]
    const { runner, transcriber } = buildRunner({ rows })
    runner.start()
    await flushMicrotasks()
    expect(rows[0]?.attempts).toBe(1)
    await runner.close()
    expect(rows[0]).toMatchObject({ attempts: 0, leaseToken: '', status: 'pending' })
    expect(transcriber.signals[0]?.aborted).toBe(true)
    await flushMicrotasks()
    expect(rows[0]).toMatchObject({ attempts: 0, status: 'pending' })
    expect(runner.start()).toBe(AUDIO_TRANSCRIPTION_RUNNER_START.ALREADY_RUNNING)
  })

  test('close() without an execution is a no-op', async () => {
    const { runner } = buildRunner({ rows: [] })
    await runner.close()
    expect(runner.isRunning()).toBe(false)
  })

  test('two executions racing for the same line: only the one holding the lease token writes', async () => {
    const rows = [buildFakeRow()]
    const { baseQueue, clock } = buildRunner({ rows })
    const first = await baseQueue.claimNext({ leaseMilliseconds: 1_000 })
    expect(await baseQueue.claimNext({ leaseMilliseconds: 1_000 })).toBeUndefined()
    clock.advance(1_001)
    const second = await baseQueue.claimNext({ leaseMilliseconds: 1_000 })
    expect(second?.attempts).toBe(2)
    const params = {
      audioDurationMs: 1,
      engine: 'e',
      language: 'pt',
      model: 'm',
      processingMs: 1,
      text: 'x',
    }
    expect(
      await baseQueue.markReady({
        ...params,
        id: 'transcription-1',
        leaseToken: first?.leaseToken ?? '',
      }),
    ).toBe(false)
    expect(
      await baseQueue.markReady({
        ...params,
        id: 'transcription-1',
        leaseToken: second?.leaseToken ?? '',
      }),
    ).toBe(true)
  })
})
