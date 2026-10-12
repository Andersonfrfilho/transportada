/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AttachmentObjectReaderPort } from '../aggregate-attachment/application/extract-attachment-fields.port.js'
import type { JobRoutine } from '../job-run/application/job-routine.port.js'
import type { AudioTranscriptionEnvironment, WorkerLogger } from '../shared/worker.types.js'
import type { AudioDurationProbe } from './audio-duration-probe.port.js'
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
  readonly objectReader: AttachmentObjectReaderPort
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
