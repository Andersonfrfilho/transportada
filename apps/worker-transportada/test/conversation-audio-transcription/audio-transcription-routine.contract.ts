/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3 (contract §5.6 passos 1–3, §5.8): o ciclo da rotina faz só o que é rápido, entrega ao
 * executor e fecha com um desfecho da lista fechada do job.
 */
import { describe, expect, test } from 'bun:test'

import { createAudioTranscriptionRoutine } from '../../src/conversation-audio-transcription/application/audio-transcription.routine.js'
import type { AudioTranscriptionRunnerPort } from '../../src/conversation-audio-transcription/application/audio-transcription.runner.js'
import { runJobCycle } from '../../src/job-run/application/run-job-cycle.js'
import type { JobRunEnvelopeV1 } from '../../src/messaging/job-run-envelope.schema.js'
import { isJobOutcome } from '../../src/shared/job-catalog.constant.js'
import {
  createExecutionDouble,
  createLoggerDouble,
  createManualScheduler,
} from '../job-run/job-run.double.js'
import { buildFakeRow, createFakeQueue } from '../fixtures/audio-transcription-queue.fixture.js'

const NOW = new Date('2026-10-12T12:00:00.000Z')
const EXECUTION_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

function envelopeFor(job: string): JobRunEnvelopeV1 {
  return {
    correlationId: 'tick-2026-10-12T12:00:00.000Z',
    eventId: '0f7c4a3e-9b1d-4e2f-8a5c-6d7e8f9a0b1c',
    occurredAt: NOW.toISOString(),
    payload: { executionId: EXECUTION_ID, job, origin: 'schedule' },
    type: 'transportada.job.run.requested',
    version: 1,
  } as unknown as JobRunEnvelopeV1
}

function buildRunner(overrides: Partial<AudioTranscriptionRunnerPort> = {}) {
  const starts: number[] = []
  const runner: AudioTranscriptionRunnerPort = {
    close: async () => undefined,
    start: () => {
      starts.push(1)
      return 'started'
    },
    takeSummary: () => ({ failed: 0, processed: 0, ready: 0, runnerError: 0 }),
    whenIdle: async () => undefined,
    ...overrides,
  }
  return { runner, starts }
}

function buildRoutine(runner: AudioTranscriptionRunnerPort, rowCount = 2) {
  const rows = Array.from({ length: rowCount }, () =>
    buildFakeRow({ nextAttemptAt: new Date(NOW.getTime() - 1_000) }),
  )
  const queue = createFakeQueue({ now: () => NOW, rows })
  const routine = createAudioTranscriptionRoutine({
    queue,
    recoveryWindowHours: 72,
    runner,
  })
  return { queue, routine }
}

const context = { isStopRequested: () => false }
const baseContext = {
  correlationId: 'c',
  executionId: EXECUTION_ID,
  job: 'conversation.audio.transcribe' as const,
  origin: 'schedule' as const,
  ...context,
}

describe('rotina conversation.audio.transcribe (spec 264 T3.3)', () => {
  test('o ciclo faz marco, varredura de esgotados e descoberta, nessa ordem, e só então entrega', async () => {
    const { runner, starts } = buildRunner()
    const { queue, routine } = buildRoutine(runner)

    const result = await routine.run(baseContext)

    expect(queue.calls.slice(0, 3)).toEqual([
      'materializeMarker',
      'sweepExhausted',
      'discoverPending',
    ])
    expect(queue.calls).not.toContain('claimNext')
    expect(starts).toHaveLength(1)
    expect(result.outcome).toBe('completed')
    expect(result.counters.claimable).toBe(2)
  })

  test('a varredura fecha attempts >= 3 com lease vencido como attempts_exhausted antes de reivindicar', async () => {
    const { runner } = buildRunner()
    const { queue, routine } = buildRoutine(runner, 0)
    queue.rows.push(
      buildFakeRow({
        attempts: 3,
        leaseExpiresAt: new Date(NOW.getTime() - 1),
        leaseToken: 'morto',
      }),
    )

    const result = await routine.run(baseContext)

    expect(queue.rows[0]?.status).toBe('failed')
    expect(queue.rows[0]?.failureCode).toBe('attempts_exhausted')
    expect(result.counters.exhausted).toBe(1)
  })

  test('o ciclo seguinte grava os contadores da execução anterior', async () => {
    const { runner } = buildRunner({
      takeSummary: () => ({ failed: 1, processed: 3, ready: 2, runnerError: 0 }),
    })
    const { routine } = buildRoutine(runner)
    const result = await routine.run(baseContext)
    expect(result.counters).toMatchObject({ failed: 1, processed: 3, ready: 2, runnerError: 0 })
  })

  test('executor ocupado: already_running, que não é falha', async () => {
    const { runner } = buildRunner({ start: () => 'already_running' })
    const { routine } = buildRoutine(runner)
    expect((await routine.run(baseContext)).outcome).toBe('already_running')
  })

  test('trava velha: runner_lock_expired', async () => {
    const { runner } = buildRunner({ start: () => 'runner_lock_expired' })
    const { routine } = buildRoutine(runner)
    expect((await routine.run(baseContext)).outcome).toBe('runner_lock_expired')
  })

  test('executor fechado (desligamento): o ciclo termina completed sem abrir execução', async () => {
    const { runner } = buildRunner({ start: () => 'closed' })
    const { routine } = buildRoutine(runner)
    expect((await routine.run(baseContext)).outcome).toBe('completed')
  })

  test('parada pedida antes do ciclo: não toca o banco nem o executor', async () => {
    const { runner, starts } = buildRunner()
    const { queue, routine } = buildRoutine(runner)
    const result = await routine.run({ ...baseContext, isStopRequested: () => true })
    expect(queue.calls).toHaveLength(0)
    expect(starts).toHaveLength(0)
    expect(result.outcome).toBe('completed')
  })

  test('todo desfecho que a rotina devolve está na lista fechada do job (isJobOutcome)', async () => {
    for (const outcome of ['completed', 'already_running', 'runner_lock_expired']) {
      expect(isJobOutcome({ job: 'conversation.audio.transcribe', outcome })).toBe(true)
    }
  })

  test('com o transcritor preso, um job-run de trip.canhoto.read publicado depois é confirmado antes de a transcrição terminar', async () => {
    let releaseTranscriber = (): void => undefined
    const stuck = new Promise<void>((resolve) => {
      releaseTranscriber = resolve
    })
    let transcriptionFinished = false
    let running = false
    const { runner } = buildRunner({
      start: () => {
        if (running) return 'already_running'
        running = true
        void stuck.then(() => {
          transcriptionFinished = true
          running = false
        })
        return 'started'
      },
    })
    const { routine } = buildRoutine(runner)
    const logged: { message: string; metadata: unknown }[] = []

    const transcribeExecution = createExecutionDouble({ job: 'conversation.audio.transcribe' })
    const transcribeCycle = await runJobCycle({
      dependencies: {
        executions: transcribeExecution,
        logger: createLoggerDouble(logged),
        now: () => NOW,
        routines: { 'conversation.audio.transcribe': routine },
        scheduleInterval: createManualScheduler().scheduler,
      },
      envelope: envelopeFor('conversation.audio.transcribe'),
    })
    expect(transcribeCycle.outcome).toBe('completed')
    expect(transcriptionFinished).toBe(false)

    const canhotoExecution = createExecutionDouble({ job: 'trip.canhoto.read' })
    const canhotoCycle = await runJobCycle({
      dependencies: {
        executions: canhotoExecution,
        logger: createLoggerDouble(logged),
        now: () => NOW,
        routines: {
          'trip.canhoto.read': { run: async () => ({ counters: {}, outcome: 'succeeded' }) },
        },
        scheduleInterval: createManualScheduler().scheduler,
      },
      envelope: envelopeFor('trip.canhoto.read'),
    })
    expect(canhotoCycle.outcome).toBe('succeeded')
    expect(canhotoExecution.row.finishedAt).toBeDefined()
    expect(transcriptionFinished).toBe(false)

    const second = await runJobCycle({
      dependencies: {
        executions: createExecutionDouble({ job: 'conversation.audio.transcribe' }),
        logger: createLoggerDouble(logged),
        now: () => NOW,
        routines: { 'conversation.audio.transcribe': routine },
        scheduleInterval: createManualScheduler().scheduler,
      },
      envelope: envelopeFor('conversation.audio.transcribe'),
    })
    expect(second.outcome).toBe('already_running')

    releaseTranscriber()
    await Bun.sleep(5)
    expect(transcriptionFinished).toBe(true)
  })
})
