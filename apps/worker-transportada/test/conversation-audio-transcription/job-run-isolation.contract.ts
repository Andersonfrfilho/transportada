/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3 (contract.md §5.8): com o transcritor preso, o consumidor serial do job-run segue livre.
 * Aqui o invólucro de verdade (`createJobCycle`) roda duas rotinas: a de transcrição e a do canhoto.
 */
import { describe, expect, test } from 'bun:test'

import type { JobExecutionPort } from '../../src/job-run/application/job-execution.port.js'
import { createJobCycle } from '../../src/job-run/application/run-job-cycle.js'
import { createConversationAudioTranscribeRoutine } from '../../src/conversation-audio-transcription/conversation-audio-transcribe.routine.js'
import { createAudioTranscriptionRunner } from '../../src/conversation-audio-transcription/audio-transcription.runner.js'
import type { AudioTranscriptionCycleQueuePort } from '../../src/conversation-audio-transcription/audio-transcription-queue.port.js'
import type { JobExecutionOrigin, ScheduledJob } from '../../src/shared/job-catalog.constant.js'
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
} from '../fixtures/audio-transcription-harness.fixture.js'

type Finished = {
  readonly executionId: string
  readonly outcome: string
  readonly counters: Readonly<Record<string, number>>
}

function buildScenario() {
  const clock = createFakeClock()
  const rows = [buildFakeRow()]
  const lineQueue = createFakeLineQueue(rows, clock)
  const transcriber = createHeldTranscriber()
  const logs = createLogCapture()
  const runner = createAudioTranscriptionRunner({
    batchSize: 2,
    leaseMilliseconds: 495_000,
    line: {
      durationProbe: createFixedProbe(2_000),
      logger: logs.logger,
      maxDurationMilliseconds: 600_000,
      model: 'm',
      now: clock.now,
      objectReader: createMapReader({ 'object-1': AUDIO_BYTES }),
      queue: lineQueue,
      speechToText: transcriber,
    },
    lockMaxAgeMilliseconds: 990_000,
  })
  const cycleQueue: AudioTranscriptionCycleQueuePort = {
    closeExhausted: async () => 0,
    countClaimable: async () =>
      rows.filter((row) => row.status === 'pending' && row.leaseToken === '').length,
    discoverPending: async () => 0,
    materializeMilestone: async () => undefined,
    purgeDeletedText: async () => 0,
  }
  const jobs = new Map<string, ScheduledJob>()
  const finished: Finished[] = []
  const executions: JobExecutionPort = {
    claim: async ({ executionId }) => {
      const job = jobs.get(executionId)
      return job === undefined ? undefined : { job, origin: 'schedule' as JobExecutionOrigin }
    },
    finish: async ({ counters, executionId, outcome }) =>
      void finished.push({ counters, executionId, outcome }),
    renew: async () => ({ cancelRequestedAt: undefined }),
  }
  const cycle = createJobCycle({
    executions,
    logger: logs.logger,
    now: clock.now,
    routines: {
      'conversation.audio.transcribe': createConversationAudioTranscribeRoutine({
        logger: logs.logger,
        queue: cycleQueue,
        recoveryWindowHours: 72,
        runner,
      }),
      'trip.canhoto.read': {
        run: async () => ({ counters: { proofsSeen: 0 }, outcome: 'succeeded' }),
      },
    },
  })
  const publish = (executionId: string, job: ScheduledJob) => {
    jobs.set(executionId, job)
    return cycle.run({ envelope: { correlationId: 'c', payload: { executionId } } as never })
  }
  return { finished, publish, rows, runner, transcriber }
}

describe('the transcription does not hold the serial job-run consumer (spec 264 T3.3)', () => {
  test('a canhoto job-run published after is acknowledged before the transcription ends', async () => {
    const { finished, publish, rows, transcriber } = buildScenario()
    const audio = await publish('audio-1', 'conversation.audio.transcribe')
    await flushMicrotasks()
    expect(audio.outcome).toBe('completed')
    expect(transcriber.calls).toBe(1)

    const canhoto = await publish('canhoto-1', 'trip.canhoto.read')
    expect(canhoto.outcome).toBe('succeeded')
    expect(rows[0]?.status).toBe('pending')
    expect(finished.map((entry) => entry.executionId)).toEqual(['audio-1', 'canhoto-1'])

    transcriber.finish()
    await flushMicrotasks()
    expect(rows[0]?.status).toBe('ready')
  })

  test('a second cycle while it runs is already_running — a known outcome, not unexpected_error', async () => {
    const { finished, publish, transcriber } = buildScenario()
    await publish('audio-1', 'conversation.audio.transcribe')
    await flushMicrotasks()
    const second = await publish('audio-2', 'conversation.audio.transcribe')
    expect(second.outcome).toBe('already_running')
    expect(finished.find((entry) => entry.executionId === 'audio-2')?.outcome).toBe(
      'already_running',
    )
    expect(transcriber.calls).toBe(1)
  })

  test('the cycle after the end records the previous execution in its counters', async () => {
    const { finished, publish, transcriber } = buildScenario()
    await publish('audio-1', 'conversation.audio.transcribe')
    await flushMicrotasks()
    transcriber.finish()
    await flushMicrotasks()
    await publish('audio-3', 'conversation.audio.transcribe')
    const third = finished.find((entry) => entry.executionId === 'audio-3')
    expect(third?.outcome).toBe('completed')
    expect(third?.counters).toMatchObject({ processed: 1, ready: 1 })
  })
})
