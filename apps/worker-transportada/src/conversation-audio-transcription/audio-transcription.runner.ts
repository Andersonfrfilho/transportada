/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogError } from '../logging/safe-logger.service.js'
import {
  processAudioTranscriptionLine,
  type AudioTranscriptionLineDependencies,
} from './audio-transcription-line.processor.js'
import type { ClaimedAudioTranscription } from './audio-transcription-queue.port.js'
import { AUDIO_TRANSCRIPTION_LOG_MESSAGE } from './audio-transcription-runtime.constant.js'
import {
  addLineToSummary,
  createRunSummary,
  type AudioTranscriptionRunSummary,
} from './audio-transcription-summary.js'

export const AUDIO_TRANSCRIPTION_RUNNER_START = {
  ALREADY_RUNNING: 'already_running',
  LOCK_EXPIRED: 'runner_lock_expired',
  STARTED: 'started',
} as const
export type AudioTranscriptionRunnerStart =
  (typeof AUDIO_TRANSCRIPTION_RUNNER_START)[keyof typeof AUDIO_TRANSCRIPTION_RUNNER_START]

export type AudioTranscriptionRunnerDependencies = {
  readonly line: AudioTranscriptionLineDependencies
  readonly batchSize: number
  readonly leaseMilliseconds: number
  /** `batchSize × lease`: a trava mais velha que isto é de uma execução que não volta. */
  readonly lockMaxAgeMilliseconds: number
}

/**
 * Executor em processo, com trava de uma execução (contract.md §5.8). O ciclo do job-run só o dispara
 * e segue: a transcrição de minutos não segura o consumidor serial das outras rotinas.
 */
export type AudioTranscriptionRunner = {
  isRunning(): boolean
  start(): AudioTranscriptionRunnerStart
  /** O resumo da execução que terminou, uma vez só; o ciclo seguinte o grava no job-run dele. */
  takeSummary(): AudioTranscriptionRunSummary | undefined
  close(): Promise<void>
}

type Execution = {
  readonly controller: AbortController
  readonly startedAt: Date
  inFlight: ClaimedAudioTranscription | undefined
}

export function createAudioTranscriptionRunner(
  dependencies: AudioTranscriptionRunnerDependencies,
): AudioTranscriptionRunner {
  const { batchSize, leaseMilliseconds, line, lockMaxAgeMilliseconds } = dependencies
  let current: Execution | undefined
  let lastSummary: AudioTranscriptionRunSummary | undefined
  let isClosing = false

  async function releaseInFlight(execution: Execution): Promise<void> {
    const claimed = execution.inFlight
    if (claimed === undefined) return
    execution.inFlight = undefined
    try {
      await line.queue.release({ id: claimed.id, leaseToken: claimed.leaseToken })
    } catch (error: unknown) {
      safeLogError({
        logger: line.logger,
        message: AUDIO_TRANSCRIPTION_LOG_MESSAGE.RUNNER_RELEASE_FAILED,
        metadata: {
          reason: error instanceof Error ? error.name : 'UnknownError',
          transcriptionId: claimed.id,
        },
      })
    }
  }

  async function processNext(
    execution: Execution,
    summary: AudioTranscriptionRunSummary,
  ): Promise<boolean> {
    const claimed = await line.queue.claimNext({ leaseMilliseconds })
    if (claimed === undefined) return false
    execution.inFlight = claimed
    if (execution.controller.signal.aborted) {
      await releaseInFlight(execution)
      return false
    }
    const result = await processAudioTranscriptionLine({
      dependencies: line,
      line: claimed,
      signal: execution.controller.signal,
    })
    execution.inFlight = undefined
    addLineToSummary(summary, result)
    return true
  }

  async function execute(execution: Execution): Promise<void> {
    const summary = createRunSummary()
    try {
      while (!execution.controller.signal.aborted && summary.processed < batchSize) {
        if (!(await processNext(execution, summary))) break
      }
    } catch (error: unknown) {
      summary.runnerError = 1
      safeLogError({
        logger: line.logger,
        message: AUDIO_TRANSCRIPTION_LOG_MESSAGE.RUNNER_FAILED,
        metadata: { reason: error instanceof Error ? error.name : 'UnknownError' },
      })
    } finally {
      if (current === execution) {
        current = undefined
        lastSummary = summary
      }
    }
  }

  function expireLock(execution: Execution): void {
    safeLogError({
      logger: line.logger,
      message: AUDIO_TRANSCRIPTION_LOG_MESSAGE.RUNNER_LOCK_EXPIRED,
      metadata: { lockAgeMs: line.now().getTime() - execution.startedAt.getTime() },
    })
    execution.controller.abort()
    current = undefined
  }

  function start(): AudioTranscriptionRunnerStart {
    if (isClosing) return AUDIO_TRANSCRIPTION_RUNNER_START.ALREADY_RUNNING
    if (current !== undefined) {
      const ageMs = line.now().getTime() - current.startedAt.getTime()
      if (ageMs <= lockMaxAgeMilliseconds) return AUDIO_TRANSCRIPTION_RUNNER_START.ALREADY_RUNNING
      expireLock(current)
      return AUDIO_TRANSCRIPTION_RUNNER_START.LOCK_EXPIRED
    }
    const execution: Execution = {
      controller: new AbortController(),
      inFlight: undefined,
      startedAt: line.now(),
    }
    current = execution
    void execute(execution)
    return AUDIO_TRANSCRIPTION_RUNNER_START.STARTED
  }

  function takeSummary(): AudioTranscriptionRunSummary | undefined {
    const summary = lastSummary
    lastSummary = undefined
    return summary
  }

  async function close(): Promise<void> {
    isClosing = true
    const execution = current
    if (execution === undefined) return
    execution.controller.abort()
    await releaseInFlight(execution)
  }

  return { close, isRunning: () => current !== undefined, start, takeSummary }
}
