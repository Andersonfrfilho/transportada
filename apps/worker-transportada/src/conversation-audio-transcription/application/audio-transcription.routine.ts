/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { JobRoutine, JobRoutineResult } from '../../job-run/application/job-routine.port.js'
import { RUNNER_OUTCOME } from '../domain/conversation-audio-transcription.constant.js'
import type { AudioTranscriptionQueuePort } from './audio-transcription-queue.port.js'
import type { AudioTranscriptionRunnerPort } from './audio-transcription.runner.js'

export type AudioTranscriptionRoutineDependencies = {
  readonly queue: AudioTranscriptionQueuePort
  readonly recoveryWindowHours: number
  readonly runner: AudioTranscriptionRunnerPort
}

const OUTCOME_BY_START = {
  already_running: RUNNER_OUTCOME.ALREADY_RUNNING,
  closed: RUNNER_OUTCOME.COMPLETED,
  runner_lock_expired: RUNNER_OUTCOME.RUNNER_LOCK_EXPIRED,
  started: RUNNER_OUTCOME.COMPLETED,
} as const

/**
 * O ciclo faz só os passos 1–3 do contract §5.6 (SQL rápido) e entrega ao executor: uma transcrição
 * de minutos dentro dele seguraria canhoto, planta e prévia, porque o consumidor do job-run é serial.
 * A parada do operador vale só aqui — a transcrição em curso tem prazo próprio (§5.8).
 */
export function createAudioTranscriptionRoutine(
  dependencies: AudioTranscriptionRoutineDependencies,
): JobRoutine {
  return {
    async run(context): Promise<JobRoutineResult> {
      const previous = dependencies.runner.takeSummary()
      const counters = {
        claimable: 0,
        discovered: 0,
        exhausted: 0,
        failed: previous.failed,
        processed: previous.processed,
        ready: previous.ready,
        runnerError: previous.runnerError,
      }
      if (context.isStopRequested()) return { counters, outcome: RUNNER_OUTCOME.COMPLETED }

      const { queue } = dependencies
      await queue.materializeMarker()
      counters.exhausted = await queue.sweepExhausted()
      counters.discovered = (
        await queue.discoverPending({ recoveryWindowHours: dependencies.recoveryWindowHours })
      ).created
      counters.claimable = await queue.countClaimable()

      return { counters, outcome: OUTCOME_BY_START[dependencies.runner.start()] }
    },
  }
}
