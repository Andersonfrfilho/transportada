/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type { JobRoutine } from '../job-run/application/job-routine.port.js'
import type { NfeStorageGateway } from '../storage/infrastructure/nfe-storage-gateway.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'
import { createAudioRowProcessor } from './application/audio-row-processor.js'
import { createAudioTranscriptionRoutine } from './application/audio-transcription.routine.js'
import {
  createAudioTranscriptionRunner,
  type AudioTranscriptionRunnerPort,
} from './application/audio-transcription.runner.js'
import { computeAudioLeaseMs } from './domain/conversation-audio-transcription.constant.js'
import { createDrizzleAudioTranscriptionQueue } from './infrastructure/drizzle-audio-transcription-queue.repository.js'
import {
  createFfmpegAudioDurationMeter,
  runAudioCommand,
} from './infrastructure/ffmpeg-audio-duration.meter.js'
import { createStorageAudioObjectReader } from './infrastructure/storage-audio-object-reader.gateway.js'
import { createWhisperLocalSpeechToTextGateway } from './infrastructure/whisper-local-speech-to-text.gateway.js'

export type AudioTranscriptionComposition = {
  readonly routine: JobRoutine
  readonly runner: AudioTranscriptionRunnerPort
}

type BuildParams = {
  readonly config: Pick<WorkerEnvironment, 'audioTranscription'>
  readonly database: ReturnType<typeof createDrizzleProvider>['db']
  readonly logger: WorkerLogger
  readonly storage: Pick<NfeStorageGateway, 'getObjectStream' | 'headObject'>
}

/** Sem o caminho do modelo (RF16) não há composição: a rotina não é registrada e o boot segue. */
export async function buildAudioTranscription(
  params: BuildParams,
): Promise<AudioTranscriptionComposition | undefined> {
  const settings = params.config.audioTranscription
  if (settings === undefined) return undefined

  const { createWhisperLocalTranscriber } = await import(
    '@adatechnology/audio-transcription-provider/whisper-local'
  )
  const queue = createDrizzleAudioTranscriptionQueue(params.database)
  const processor = createAudioRowProcessor({
    logger: params.logger,
    maxDurationMs: settings.maxDurationMs,
    meter: createFfmpegAudioDurationMeter({ runner: runAudioCommand }),
    now: () => new Date(),
    objectReader: createStorageAudioObjectReader({ storage: params.storage }),
    queue,
    speechToText: createWhisperLocalSpeechToTextGateway({
      modelName: modelNameFrom(settings.modelPath),
      transcriber: createWhisperLocalTranscriber({
        languageHint: 'pt',
        modelPath: settings.modelPath,
        timeoutMs: settings.timeoutMs,
        ...(settings.threads === undefined ? {} : { threads: settings.threads }),
      }),
    }),
  })
  const runner = createAudioTranscriptionRunner({
    batchSize: settings.batchSize,
    leaseMs: computeAudioLeaseMs(settings.timeoutMs),
    logger: params.logger,
    now: () => new Date(),
    processor,
    queue,
  })

  return {
    routine: createAudioTranscriptionRoutine({
      queue,
      recoveryWindowHours: settings.recoveryWindowHours,
      runner,
    }),
    runner,
  }
}

/** `ggml-small-q5_1.bin` → `small-q5_1`: só o nome do modelo vai para a linha, nunca o caminho. */
function modelNameFrom(modelPath: string): string {
  const fileName = modelPath.split(/[\\/]/u).at(-1) ?? modelPath
  return fileName
    .replace(/^ggml-/u, '')
    .replace(/\.bin$/u, '')
    .slice(0, 64)
}
