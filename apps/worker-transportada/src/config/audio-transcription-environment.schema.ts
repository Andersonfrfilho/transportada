/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { availableParallelism } from 'node:os'

import { z } from 'zod'

import { AUDIO_TRANSCRIPTION_DEFAULT_MAX_DURATION_MS } from '../shared/conversation-audio-transcription.constant.js'
import type { AudioTranscriptionEnvironment } from '../shared/worker.types.js'

const DEFAULT_BINARY_PATH = 'whisper-cli'
const DEFAULT_TIMEOUT_MILLISECONDS = 300_000
const DEFAULT_RECOVERY_WINDOW_HOURS = 72
const DEFAULT_BATCH_SIZE = 2
const DEFAULT_LANGUAGE = 'pt'

/** Vazio é o padrão: o `.env.example` escreve a linha sem derrubar o boot (mesma regra da API). */
function blankAsUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value
}

/** ADR-0103: no máximo 7 — `availableParallelism()` pode ler os núcleos do host, não a cota do contêiner. */
const MAX_DEFAULT_THREADS = 7

/** Padrão do plano § d: um núcleo livre para as outras rotinas do worker, entre 1 e 7. */
function defaultThreads(): number {
  return Math.min(MAX_DEFAULT_THREADS, Math.max(1, availableParallelism() - 1))
}

export const audioTranscriptionEnvironmentShape = {
  AUDIO_TRANSCRIPTION_BATCH_SIZE: z.preprocess(
    blankAsUndefined,
    z.coerce.number().int().min(1).max(50).default(DEFAULT_BATCH_SIZE),
  ),
  AUDIO_TRANSCRIPTION_BINARY_PATH: z.preprocess(
    blankAsUndefined,
    z.string().trim().min(1).default(DEFAULT_BINARY_PATH),
  ),
  AUDIO_TRANSCRIPTION_LANGUAGE: z.preprocess(
    blankAsUndefined,
    z
      .string()
      .trim()
      .regex(/^[a-z]{2}$/u)
      .default(DEFAULT_LANGUAGE),
  ),
  AUDIO_TRANSCRIPTION_MAX_DURATION_MS: z.preprocess(
    blankAsUndefined,
    z.coerce
      .number()
      .int()
      .min(1_000)
      .max(3_600_000)
      .default(AUDIO_TRANSCRIPTION_DEFAULT_MAX_DURATION_MS),
  ),
  // Ausente, a rotina não é registrada (RF16): boot verde e `job_run_routine_missing`.
  AUDIO_TRANSCRIPTION_MODEL_PATH: z.preprocess(
    blankAsUndefined,
    z.string().trim().min(1).optional(),
  ),
  // Em horas, como `FLEET_VEHICLE_CATALOG_CACHE_HOURS` na API.
  AUDIO_TRANSCRIPTION_RECOVERY_WINDOW: z.preprocess(
    blankAsUndefined,
    z.coerce.number().int().min(1).max(720).default(DEFAULT_RECOVERY_WINDOW_HOURS),
  ),
  AUDIO_TRANSCRIPTION_THREADS: z.preprocess(
    blankAsUndefined,
    z.coerce.number().int().min(1).max(64).optional(),
  ),
  AUDIO_TRANSCRIPTION_TIMEOUT_MS: z.preprocess(
    blankAsUndefined,
    z.coerce.number().int().min(1_000).max(3_600_000).default(DEFAULT_TIMEOUT_MILLISECONDS),
  ),
}

type AudioTranscriptionEnvironmentData = z.infer<
  z.ZodObject<typeof audioTranscriptionEnvironmentShape>
>

export function toAudioTranscriptionEnvironment(data: AudioTranscriptionEnvironmentData): {
  readonly audioTranscription?: AudioTranscriptionEnvironment
} {
  if (data.AUDIO_TRANSCRIPTION_MODEL_PATH === undefined) return {}
  return {
    audioTranscription: {
      batchSize: data.AUDIO_TRANSCRIPTION_BATCH_SIZE,
      binaryPath: data.AUDIO_TRANSCRIPTION_BINARY_PATH,
      language: data.AUDIO_TRANSCRIPTION_LANGUAGE,
      maxDurationMilliseconds: data.AUDIO_TRANSCRIPTION_MAX_DURATION_MS,
      modelPath: data.AUDIO_TRANSCRIPTION_MODEL_PATH,
      recoveryWindowHours: data.AUDIO_TRANSCRIPTION_RECOVERY_WINDOW,
      threads: data.AUDIO_TRANSCRIPTION_THREADS ?? defaultThreads(),
      timeoutMilliseconds: data.AUDIO_TRANSCRIPTION_TIMEOUT_MS,
    },
  }
}
