/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { JobRoutine, JobRoutineResult } from '../job-run/application/job-routine.port.js'
import { safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerLogger } from '../shared/worker.types.js'
import type { AudioTranscriptionCycleQueuePort } from './audio-transcription-queue.port.js'
import {
  AUDIO_TRANSCRIBE_JOB_OUTCOME,
  AUDIO_TRANSCRIPTION_LOG_MESSAGE,
} from './audio-transcription-runtime.constant.js'
import { summaryToCounters } from './audio-transcription-summary.js'
import {
  AUDIO_TRANSCRIPTION_RUNNER_START,
  type AudioTranscriptionRunner,
} from './audio-transcription.runner.js'

export type ConversationAudioTranscribeRoutineDependencies = {
  readonly queue: AudioTranscriptionCycleQueuePort
  readonly runner: AudioTranscriptionRunner
  readonly logger: WorkerLogger
  readonly recoveryWindowHours: number
}

type CycleOutcome = JobRoutineResult['outcome']

/** O ciclo da rotina é só SQL (marco, varredura, descoberta, expurgo, contagem) e a entrega ao executor. */
export function createConversationAudioTranscribeRoutine(
  dependencies: ConversationAudioTranscribeRoutineDependencies,
): JobRoutine {
  const { logger, queue, recoveryWindowHours, runner } = dependencies

  return {
    async run(context) {
      await queue.materializeMilestone()
      const exhausted = await queue.closeExhausted()
      const created = await queue.discoverPending({ recoveryWindowHours })
      const purged = await queue.purgeDeletedText()
      const claimable = await queue.countClaimable()
      // Lido DEPOIS do SQL: se ele lançar, o resumo continua no executor para o ciclo seguinte.
      const previous = runner.takeSummary()

      const outcome = resolveHandoff({
        isIdle: claimable === 0 && !runner.isRunning(),
        isStopRequested: context.isStopRequested(),
        runner,
      })
      const counters = {
        ...(previous === undefined ? {} : summaryToCounters(previous)),
        claimable,
        created,
        exhausted,
        purgedText: purged,
      }
      safeLogInfo({
        logger,
        message: AUDIO_TRANSCRIPTION_LOG_MESSAGE.CYCLE_FINISHED,
        metadata: {
          ...counters,
          correlationId: context.correlationId,
          executionId: context.executionId,
          outcome,
        },
      })
      return { counters, outcome }
    },
  }
}

type HandoffParams = {
  readonly isIdle: boolean
  readonly isStopRequested: boolean
  readonly runner: AudioTranscriptionRunner
}

function resolveHandoff(params: HandoffParams): CycleOutcome {
  if (params.isIdle || params.isStopRequested) return AUDIO_TRANSCRIBE_JOB_OUTCOME.SUCCEEDED
  const started = params.runner.start()
  if (started === AUDIO_TRANSCRIPTION_RUNNER_START.ALREADY_RUNNING) {
    return AUDIO_TRANSCRIBE_JOB_OUTCOME.ALREADY_RUNNING
  }
  if (started === AUDIO_TRANSCRIPTION_RUNNER_START.LOCK_EXPIRED) {
    return AUDIO_TRANSCRIBE_JOB_OUTCOME.RUNNER_LOCK_EXPIRED
  }
  return AUDIO_TRANSCRIBE_JOB_OUTCOME.SUCCEEDED
}
