/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { JobRoutine } from '../job-run/application/job-routine.port.js'
import type { AudioTranscriptionEnvironment, WorkerLogger } from '../shared/worker.types.js'
import type { AudioDurationProbe } from './audio-duration-probe.port.js'
import type { AudioObjectReader } from './audio-object-reader.port.js'
import { safeLogError } from '../logging/safe-logger.service.js'
import { AUDIO_TRANSCRIPTION_LOG_MESSAGE } from './audio-transcription-runtime.constant.js'
import {
  checkAudioTranscriptionTooling,
  type AudioTranscriptionToolingProbe,
} from './audio-transcription-tooling.policy.js'
import {
  computeLeaseMilliseconds,
  computeRunnerLockMaxAgeMilliseconds,
} from './audio-transcription-retry.policy.js'
import { resolveModelName } from './audio-transcription-text.policy.js'
import {
  createAudioTranscriptionRunner,
  type AudioTranscriptionRunner,
} from './audio-transcription.runner.js'
import { createConversationAudioTranscribeRoutine } from './conversation-audio-transcribe.routine.js'
import {
  createDrizzleAudioTranscriptionCycleQueue,
  type AudioTranscriptionDatabase,
} from './drizzle-audio-transcription-cycle.repository.js'
import { createDrizzleAudioTranscriptionLineQueue } from './drizzle-audio-transcription-line.repository.js'
import { createFfprobeAudioDurationProbe } from './ffprobe-audio-duration-probe.gateway.js'
import type { SpeechToText } from './speech-to-text.port.js'
import { createWhisperLocalSpeechToText } from './whisper-local-speech-to-text.gateway.js'

export type AudioTranscriptionRuntimeParams = {
  readonly environment: AudioTranscriptionEnvironment
  readonly database: AudioTranscriptionDatabase
  readonly objectReader: AudioObjectReader
  readonly logger: WorkerLogger
  /** Só o teste troca o motor e a sonda; em produção são o whisper local e o `ffprobe`. */
  readonly speechToText?: SpeechToText
  readonly durationProbe?: AudioDurationProbe
}

export type AudioTranscriptionRuntime = {
  readonly routine: JobRoutine
  readonly runner: AudioTranscriptionRunner
}

export function buildAudioTranscriptionRuntime(
  params: AudioTranscriptionRuntimeParams,
): AudioTranscriptionRuntime {
  const { database, environment, logger, objectReader } = params
  const leaseMilliseconds = computeLeaseMilliseconds(environment.timeoutMilliseconds)
  const runner = createAudioTranscriptionRunner({
    batchSize: environment.batchSize,
    leaseMilliseconds,
    line: {
      durationProbe: params.durationProbe ?? createFfprobeAudioDurationProbe({}),
      logger,
      maxDurationMilliseconds: environment.maxDurationMilliseconds,
      model: resolveModelName(environment.modelPath),
      now: () => new Date(),
      objectReader,
      queue: createDrizzleAudioTranscriptionLineQueue(database),
      speechToText: params.speechToText ?? createWhisperLocalSpeechToText({ environment }),
    },
    lockMaxAgeMilliseconds: computeRunnerLockMaxAgeMilliseconds({
      batchSize: environment.batchSize,
      leaseMilliseconds,
    }),
  })
  const routine = createConversationAudioTranscribeRoutine({
    logger,
    queue: createDrizzleAudioTranscriptionCycleQueue(database),
    recoveryWindowHours: environment.recoveryWindowHours,
    runner,
  })
  return { routine, runner }
}

export type RegisterAudioTranscriptionRuntimeParams = AudioTranscriptionRuntimeParams & {
  readonly toolingProbe?: AudioTranscriptionToolingProbe
}

/**
 * Com o modelo configurado mas binário, `ffprobe`, `ffmpeg` ou o arquivo do modelo ausentes, a rotina NÃO
 * é registrada e o boot segue verde (como a ausência do modelo, RF16: `job_run_routine_missing`, e as outras
 * rotinas do worker não podem cair por causa disto). O erro vai ao log com os nomes do que falta, no boot.
 */
export function registerAudioTranscriptionRuntime(
  params: RegisterAudioTranscriptionRuntimeParams,
): AudioTranscriptionRuntime | undefined {
  const missing = checkAudioTranscriptionTooling({
    environment: params.environment,
    ...(params.toolingProbe === undefined ? {} : { probe: params.toolingProbe }),
  })
  if (missing.length > 0) {
    safeLogError({
      logger: params.logger,
      message: AUDIO_TRANSCRIPTION_LOG_MESSAGE.TOOLING_MISSING,
      metadata: { missing },
    })
    return undefined
  }
  return buildAudioTranscriptionRuntime(params)
}
