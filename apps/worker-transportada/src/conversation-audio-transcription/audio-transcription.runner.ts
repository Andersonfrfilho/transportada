/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogError } from '../logging/safe-logger.service.js'
import {
  processAudioTranscriptionLine,
  type AudioTranscriptionLineDependencies,
} from './audio-transcription-line.processor.js'
import type { ClaimedAudioTranscription } from './audio-transcription-queue.port.js'
import {
  AUDIO_TRANSCRIPTION_LOG_MESSAGE,
  UNKNOWN_ERROR_NAME,
} from './audio-transcription-runtime.constant.js'
import {
  addLineToSummary,
  createRunSummary,
  mergeRunSummaries,
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
  claiming: Promise<ClaimedAudioTranscription | undefined> | undefined
  releasing: Promise<void> | undefined
}

export class AudioTranscriptionRunnerService implements AudioTranscriptionRunner {
  readonly #dependencies: AudioTranscriptionRunnerDependencies
  #current: Execution | undefined
  #lastSummary: AudioTranscriptionRunSummary | undefined
  #isClosing = false

  constructor(dependencies: AudioTranscriptionRunnerDependencies) {
    this.#dependencies = dependencies
  }

  isRunning(): boolean {
    return this.#current !== undefined
  }

  takeSummary(): AudioTranscriptionRunSummary | undefined {
    const summary = this.#lastSummary
    this.#lastSummary = undefined
    return summary
  }

  start(): AudioTranscriptionRunnerStart {
    if (this.#isClosing) return AUDIO_TRANSCRIPTION_RUNNER_START.ALREADY_RUNNING
    const current = this.#current
    if (current !== undefined) return this.#startWhileRunning(current)

    const execution: Execution = {
      claiming: undefined,
      releasing: undefined,
      controller: new AbortController(),
      inFlight: undefined,
      startedAt: this.#dependencies.line.now(),
    }
    this.#current = execution
    void this.#execute(execution)
    return AUDIO_TRANSCRIPTION_RUNNER_START.STARTED
  }

  async close(): Promise<void> {
    this.#isClosing = true
    const execution = this.#current
    if (execution === undefined) return
    execution.controller.abort()
    // A reivindicação em voo termina ANTES de soltar: senão a linha alugada depois do close ficaria presa.
    await execution.claiming?.catch(() => undefined)
    await this.#releaseInFlight(execution)
    // A soltura que o laço começou ao ver o aborto também precisa terminar antes de o banco fechar.
    await execution.releasing
  }

  #startWhileRunning(current: Execution): AudioTranscriptionRunnerStart {
    const { line, lockMaxAgeMilliseconds } = this.#dependencies
    const ageMs = line.now().getTime() - current.startedAt.getTime()
    if (ageMs <= lockMaxAgeMilliseconds) return AUDIO_TRANSCRIPTION_RUNNER_START.ALREADY_RUNNING
    safeLogError({
      logger: line.logger,
      message: AUDIO_TRANSCRIPTION_LOG_MESSAGE.RUNNER_LOCK_EXPIRED,
      metadata: { lockAgeMs: ageMs },
    })
    current.controller.abort()
    this.#current = undefined
    return AUDIO_TRANSCRIPTION_RUNNER_START.LOCK_EXPIRED
  }

  #releaseInFlight(execution: Execution): Promise<void> {
    const claimed = execution.inFlight
    if (claimed === undefined) return Promise.resolve()
    execution.inFlight = undefined
    execution.releasing = this.#release(claimed)
    return execution.releasing
  }

  async #release(claimed: ClaimedAudioTranscription): Promise<void> {
    const { line } = this.#dependencies
    try {
      await line.queue.release({ id: claimed.id, leaseToken: claimed.leaseToken })
    } catch (error: unknown) {
      safeLogError({
        logger: line.logger,
        message: AUDIO_TRANSCRIPTION_LOG_MESSAGE.RUNNER_RELEASE_FAILED,
        metadata: {
          reason: error instanceof Error ? error.name : UNKNOWN_ERROR_NAME,
          transcriptionId: claimed.id,
        },
      })
    }
  }

  async #processNext(
    execution: Execution,
    summary: AudioTranscriptionRunSummary,
  ): Promise<boolean> {
    const { leaseMilliseconds, line } = this.#dependencies
    execution.claiming = line.queue.claimNext({ leaseMilliseconds })
    const claimed = await execution.claiming
    execution.claiming = undefined
    if (claimed === undefined) return false
    execution.inFlight = claimed
    if (execution.controller.signal.aborted) {
      await this.#releaseInFlight(execution)
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

  async #execute(execution: Execution): Promise<void> {
    const { batchSize, line } = this.#dependencies
    const summary = createRunSummary()
    try {
      while (!execution.controller.signal.aborted && summary.processed < batchSize) {
        if (!(await this.#processNext(execution, summary))) break
      }
    } catch (error: unknown) {
      summary.runnerError = 1
      safeLogError({
        logger: line.logger,
        message: AUDIO_TRANSCRIPTION_LOG_MESSAGE.RUNNER_FAILED,
        metadata: { reason: error instanceof Error ? error.name : UNKNOWN_ERROR_NAME },
      })
    } finally {
      if (this.#current === execution) this.#current = undefined
      // Execução de trava vencida também entrega o que fez: soma, nunca apaga o resumo da nova.
      this.#lastSummary =
        this.#lastSummary === undefined ? summary : mergeRunSummaries(this.#lastSummary, summary)
    }
  }
}

export function createAudioTranscriptionRunner(
  dependencies: AudioTranscriptionRunnerDependencies,
): AudioTranscriptionRunner {
  return new AudioTranscriptionRunnerService(dependencies)
}
