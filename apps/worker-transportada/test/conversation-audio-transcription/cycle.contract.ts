/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3 (contract.md §5.6 passos 1-3 e §5.8): o ciclo é só SQL e a entrega ao executor.
 */
import { describe, expect, test } from 'bun:test'

import type { AudioTranscriptionCycleQueuePort } from '../../src/conversation-audio-transcription/audio-transcription-queue.port.js'
import type { AudioTranscriptionRunSummary } from '../../src/conversation-audio-transcription/audio-transcription-summary.js'
import { createConversationAudioTranscribeRoutine } from '../../src/conversation-audio-transcription/conversation-audio-transcribe.routine.js'
import {
  AUDIO_TRANSCRIPTION_RUNNER_START,
  type AudioTranscriptionRunner,
} from '../../src/conversation-audio-transcription/audio-transcription.runner.js'
import { createLogCapture } from '../fixtures/audio-transcription-doubles.fixture.js'

const SUMMARY: AudioTranscriptionRunSummary = {
  disabled: 1,
  failed: 2,
  failedByCode: { too_long: 1, unsupported_format: 1 },
  infrastructure: 0,
  processed: 5,
  purged: 0,
  ready: 1,
  retried: 1,
  runnerError: 0,
}

function buildCycle(options: {
  readonly claimable?: number
  readonly start?: string
  readonly isRunning?: boolean
  readonly summary?: AudioTranscriptionRunSummary
}) {
  const calls: string[] = []
  let isFailing = false
  const queue: AudioTranscriptionCycleQueuePort = {
    closeExhausted: async () => {
      if (isFailing) throw new Error('sql down')
      calls.push('sweep')
      return 1
    },
    countClaimable: async () => (calls.push('count'), options.claimable ?? 0),
    discoverPending: async (params) => (calls.push(`discover:${params.recoveryWindowHours}`), 3),
    materializeMilestone: async () => void calls.push('milestone'),
    purgeDeletedText: async () => (calls.push('purge'), 2),
  }
  let summary = options.summary
  const runner: AudioTranscriptionRunner = {
    close: async () => undefined,
    isRunning: () => options.isRunning ?? false,
    start: () => {
      calls.push('start')
      return (options.start ?? AUDIO_TRANSCRIPTION_RUNNER_START.STARTED) as 'started'
    },
    takeSummary: () => {
      const taken = summary
      summary = undefined
      return taken
    },
  }
  const logs = createLogCapture()
  const routine = createConversationAudioTranscribeRoutine({
    logger: logs.logger,
    queue,
    recoveryWindowHours: 72,
    runner,
  })
  const run = (isStopRequested = false) =>
    routine.run({
      correlationId: 'c',
      executionId: 'e',
      isStopRequested: () => isStopRequested,
      job: 'conversation.audio.transcribe',
      origin: 'schedule',
    })
  return { calls, logs, run, setFailing: (value: boolean) => void (isFailing = value) }
}

describe('conversation.audio.transcribe cycle (spec 264 T3.3)', () => {
  test('runs the SQL steps in the contract order and then hands over to the executor', async () => {
    const { calls, run } = buildCycle({ claimable: 4 })
    const result = await run()
    expect(calls).toEqual(['milestone', 'sweep', 'discover:72', 'purge', 'count', 'start'])
    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({ claimable: 4, created: 3, exhausted: 1, purgedText: 2 })
  })

  test('with nothing to claim and an idle executor it completes without starting one', async () => {
    const { calls, run } = buildCycle({ claimable: 0 })
    const result = await run()
    expect(calls).not.toContain('start')
    expect(result.outcome).toBe('succeeded')
  })

  test('a busy executor is already_running, even with nothing left to claim', async () => {
    const { run } = buildCycle({
      claimable: 0,
      isRunning: true,
      start: AUDIO_TRANSCRIPTION_RUNNER_START.ALREADY_RUNNING,
    })
    expect((await run()).outcome).toBe('already_running')
  })

  test('a stale lock surfaces as runner_lock_expired', async () => {
    const { run } = buildCycle({
      claimable: 1,
      isRunning: true,
      start: AUDIO_TRANSCRIPTION_RUNNER_START.LOCK_EXPIRED,
    })
    expect((await run()).outcome).toBe('runner_lock_expired')
  })

  test('records the previous execution in this job-run counters, once', async () => {
    const { run } = buildCycle({ claimable: 0, summary: SUMMARY })
    const first = await run()
    expect(first.counters).toMatchObject({
      disabled: 1,
      failed: 2,
      failedTooLong: 1,
      failedUnsupportedFormat: 1,
      processed: 5,
      ready: 1,
      retried: 1,
      runnerError: 0,
    })
    expect((await run()).counters).not.toHaveProperty('processed')
  })

  test('a stop request limits the cycle to the SQL steps', async () => {
    const { calls, run } = buildCycle({ claimable: 5 })
    const result = await run(true)
    expect(calls).not.toContain('start')
    expect(result.outcome).toBe('succeeded')
  })

  test('the cycle log carries counters only', async () => {
    const { logs, run } = buildCycle({ claimable: 1, summary: SUMMARY })
    await run()
    expect(logs.lines.map((line) => line.message)).toEqual(['audio_transcription_cycle_finished'])
  })

  test('a failing SQL step leaves the previous summary for the next cycle (L1)', async () => {
    const { run, setFailing } = buildCycle({ claimable: 0, summary: SUMMARY })
    setFailing(true)
    await expect(run()).rejects.toThrow('sql down')
    setFailing(false)
    expect((await run()).counters).toMatchObject({ processed: 5, ready: 1 })
  })
})
