/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogError, safeLogInfo } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import type { AudioRowProcessorPort } from './audio-row-processor.js'
import type { AudioTranscriptionQueuePort } from './audio-transcription-queue.port.js'

export type RunnerSummary = {
  failed: number
  processed: number
  ready: number
  runnerError: number
}

export type RunnerStartResult = 'already_running' | 'closed' | 'runner_lock_expired' | 'started'

export type AudioTranscriptionRunnerPort = {
  /** Aborta a execução em curso (que solta a linha em posse) e recusa novas. */
  close(): Promise<void>
  /** Devolve na hora: a transcrição corre fora do ciclo serial do job-run (contract §5.8). */
  start(): RunnerStartResult
  /** O resumo da execução que terminou, entregue uma vez só ao ciclo seguinte. */
  takeSummary(): RunnerSummary
  whenIdle(): Promise<void>
}

export type AudioTranscriptionRunnerDependencies = {
  readonly batchSize: number
  readonly leaseMs: number
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly processor: AudioRowProcessorPort
  readonly queue: AudioTranscriptionQueuePort
}

type ActiveRun = {
  readonly generation: number
  readonly promise: Promise<void>
  readonly startedAt: Date
}

function emptySummary(): RunnerSummary {
  return { failed: 0, processed: 0, ready: 0, runnerError: 0 }
}

/**
 * Executor em processo com trava de uma execução. Toda escrita da linha exige o `lease_token`, então
 * a trava solta por velhice (`runner_lock_expired`) nunca deixa duas execuções corromperem a fila.
 */
export function createAudioTranscriptionRunner(
  dependencies: AudioTranscriptionRunnerDependencies,
): AudioTranscriptionRunnerPort {
  const controller = new AbortController()
  const maxLockAgeMs = dependencies.batchSize * dependencies.leaseMs
  let active: ActiveRun | undefined
  let closed = false
  let generation = 0
  let summary = emptySummary()

  async function execute(runGeneration: number): Promise<void> {
    const local = emptySummary()
    try {
      await dependencies.queue.purgeDeletedObjects()
      for (let position = 0; position < dependencies.batchSize && !closed; position += 1) {
        const claimed = await dependencies.queue.claimNext({ leaseMs: dependencies.leaseMs })
        if (claimed === undefined) break
        const outcome = await dependencies.processor.process({
          claimed,
          signal: controller.signal,
        })
        local.processed += 1
        if (outcome === 'ready') local.ready += 1
        if (outcome === 'failed') local.failed += 1
      }
    } catch (error) {
      local.runnerError = 1
      safeLogError({
        logger: dependencies.logger,
        message: 'audio_transcription_runner_failed',
        metadata: { reason: error instanceof Error ? error.name : 'UnknownError' },
      })
    } finally {
      if (active?.generation === runGeneration) {
        summary = {
          failed: summary.failed + local.failed,
          processed: summary.processed + local.processed,
          ready: summary.ready + local.ready,
          runnerError: summary.runnerError + local.runnerError,
        }
        active = undefined
      }
    }
  }

  function begin(): void {
    generation += 1
    active = { generation, promise: execute(generation), startedAt: dependencies.now() }
  }

  return {
    async close() {
      closed = true
      controller.abort()
      await active?.promise
    },

    start() {
      if (closed) return 'closed'
      if (active === undefined) {
        begin()
        return 'started'
      }

      const ageMs = dependencies.now().getTime() - active.startedAt.getTime()
      if (ageMs <= maxLockAgeMs) return 'already_running'

      safeLogError({
        logger: dependencies.logger,
        message: 'audio_transcription_runner_lock_expired',
        metadata: { ageMs, maxLockAgeMs },
      })
      active = undefined
      return 'runner_lock_expired'
    },

    takeSummary() {
      const taken = summary
      summary = emptySummary()
      if (taken.processed + taken.runnerError > 0) {
        safeLogInfo({
          logger: dependencies.logger,
          message: 'audio_transcription_runner_summary',
          metadata: { ...taken },
        })
      }
      return taken
    },

    async whenIdle() {
      await active?.promise
    },
  }
}
