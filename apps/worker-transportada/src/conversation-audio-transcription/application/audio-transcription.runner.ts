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
  readonly controller: AbortController
  promise: Promise<void>
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
  const shutdown = new AbortController()
  const maxLockAgeMs = dependencies.batchSize * dependencies.leaseMs
  const running = new Set<Promise<void>>()
  let active: ActiveRun | undefined
  let closed = false
  let summary = emptySummary()

  async function execute(run: ActiveRun): Promise<void> {
    const local = emptySummary()
    const { signal } = run.controller
    try {
      await dependencies.queue.purgeDeletedObjects()
      for (let position = 0; position < dependencies.batchSize && !signal.aborted; position += 1) {
        const claimed = await dependencies.queue.claimNext({ leaseMs: dependencies.leaseMs })
        if (claimed === undefined) break
        const outcome = await dependencies.processor.process({ claimed, signal })
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
      // Laço abandonado pela trava velha não entrega resumo: o ciclo já seguiu para outra execução.
      if (active === run) {
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
    const controller = new AbortController()
    const abortWithShutdown = (): void => controller.abort()
    shutdown.signal.addEventListener('abort', abortWithShutdown, { once: true })
    const run: ActiveRun = {
      controller,
      promise: Promise.resolve(),
      startedAt: dependencies.now(),
    }
    run.promise = execute(run).finally(() => {
      running.delete(run.promise)
      shutdown.signal.removeEventListener('abort', abortWithShutdown)
    })
    running.add(run.promise)
    active = run
  }

  return {
    async close() {
      closed = true
      shutdown.abort()
      await Promise.all([...running])
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
      // Aborta o laço velho: ele devolve a linha em posse e para de reivindicar, em vez de ficar órfão.
      active.controller.abort()
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
      await Promise.all([...running])
    },
  }
}
