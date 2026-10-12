/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { availableParallelism } from 'node:os'

import { describe, expect, test } from 'bun:test'

import {
  parseWorkerEnvironment,
  WorkerConfigurationError,
} from '../../src/config/environment.schema.js'
import { isAudioTranscriptionConfigured } from '../../src/conversation-audio-transcription/audio-transcription-configured.policy.js'

const BASE_WORKER_ENVIRONMENT = {
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
  FOUNDATION_SYNTHETIC_CONSUMER_ENABLED: 'false',
  LOG_LEVEL: 'info',
  QUEUE_PREFIX: 'transportada_local',
  RABBITMQ_URL: 'amqp://transportada:transportada@localhost:55672',
  WORKER_PORT: '53002',
}

const MODEL_PATH = '/models/ggml-small-q5_1.bin'

function parseWith(extra: Record<string, string>) {
  return parseWorkerEnvironment({ ...BASE_WORKER_ENVIRONMENT, ...extra })
}

describe('audio transcription environment (spec 264 T3.2)', () => {
  test('without a model the routine is not configured and the boot stays green', () => {
    const environment = parseWith({})
    expect(environment.audioTranscription).toBeUndefined()
    expect(isAudioTranscriptionConfigured(environment)).toBe(false)
    expect(
      isAudioTranscriptionConfigured(parseWith({ AUDIO_TRANSCRIPTION_MODEL_PATH: '  ' })),
    ).toBe(false)
  })

  test('with a model every other variable falls back to the plan defaults', () => {
    const environment = parseWith({ AUDIO_TRANSCRIPTION_MODEL_PATH: MODEL_PATH })
    expect(isAudioTranscriptionConfigured(environment)).toBe(true)
    expect(environment.audioTranscription).toEqual({
      batchSize: 2,
      binaryPath: 'whisper-cli',
      language: 'pt',
      maxDurationMilliseconds: 600_000,
      modelPath: MODEL_PATH,
      recoveryWindowHours: 72,
      threads: Math.max(1, availableParallelism() - 1),
      timeoutMilliseconds: 300_000,
    })
  })

  test('blank values mean the default, as in the API schema', () => {
    const environment = parseWith({
      AUDIO_TRANSCRIPTION_BATCH_SIZE: '',
      AUDIO_TRANSCRIPTION_BINARY_PATH: ' ',
      AUDIO_TRANSCRIPTION_LANGUAGE: '',
      AUDIO_TRANSCRIPTION_MAX_DURATION_MS: '',
      AUDIO_TRANSCRIPTION_MODEL_PATH: MODEL_PATH,
      AUDIO_TRANSCRIPTION_RECOVERY_WINDOW: '',
      AUDIO_TRANSCRIPTION_THREADS: '',
      AUDIO_TRANSCRIPTION_TIMEOUT_MS: '',
    })
    expect(environment.audioTranscription?.maxDurationMilliseconds).toBe(600_000)
    expect(environment.audioTranscription?.recoveryWindowHours).toBe(72)
    expect(environment.audioTranscription?.binaryPath).toBe('whisper-cli')
  })

  test('explicit values are honoured', () => {
    const environment = parseWith({
      AUDIO_TRANSCRIPTION_BATCH_SIZE: '5',
      AUDIO_TRANSCRIPTION_BINARY_PATH: '/usr/local/bin/whisper-cli',
      AUDIO_TRANSCRIPTION_LANGUAGE: 'en',
      AUDIO_TRANSCRIPTION_MAX_DURATION_MS: '120000',
      AUDIO_TRANSCRIPTION_MODEL_PATH: MODEL_PATH,
      AUDIO_TRANSCRIPTION_RECOVERY_WINDOW: '24',
      AUDIO_TRANSCRIPTION_THREADS: '3',
      AUDIO_TRANSCRIPTION_TIMEOUT_MS: '60000',
    })
    expect(environment.audioTranscription).toEqual({
      batchSize: 5,
      binaryPath: '/usr/local/bin/whisper-cli',
      language: 'en',
      maxDurationMilliseconds: 120_000,
      modelPath: MODEL_PATH,
      recoveryWindowHours: 24,
      threads: 3,
      timeoutMilliseconds: 60_000,
    })
  })

  const OUT_OF_RANGE = [
    ['AUDIO_TRANSCRIPTION_MAX_DURATION_MS', '999'],
    ['AUDIO_TRANSCRIPTION_MAX_DURATION_MS', '3600001'],
    ['AUDIO_TRANSCRIPTION_MAX_DURATION_MS', 'ten minutes'],
    ['AUDIO_TRANSCRIPTION_TIMEOUT_MS', '999'],
    ['AUDIO_TRANSCRIPTION_THREADS', '0'],
    ['AUDIO_TRANSCRIPTION_BATCH_SIZE', '0'],
    ['AUDIO_TRANSCRIPTION_RECOVERY_WINDOW', '0'],
    ['AUDIO_TRANSCRIPTION_RECOVERY_WINDOW', '721'],
    ['AUDIO_TRANSCRIPTION_LANGUAGE', 'portuguese'],
  ] as const

  for (const [name, value] of OUT_OF_RANGE) {
    test(`${name}=${value} drops the boot`, () => {
      expect(() =>
        parseWith({ [name]: value, AUDIO_TRANSCRIPTION_MODEL_PATH: MODEL_PATH }),
      ).toThrow(WorkerConfigurationError)
    })
  }

  test('the limits match the API schema (min 1000, max 3600000)', () => {
    expect(
      parseWith({
        AUDIO_TRANSCRIPTION_MAX_DURATION_MS: '1000',
        AUDIO_TRANSCRIPTION_MODEL_PATH: MODEL_PATH,
      }).audioTranscription?.maxDurationMilliseconds,
    ).toBe(1_000)
    expect(
      parseWith({
        AUDIO_TRANSCRIPTION_MAX_DURATION_MS: '3600000',
        AUDIO_TRANSCRIPTION_MODEL_PATH: MODEL_PATH,
      }).audioTranscription?.maxDurationMilliseconds,
    ).toBe(3_600_000)
  })

  test('the package is pinned exactly', async () => {
    const manifest = (await Bun.file(new URL('../../package.json', import.meta.url)).json()) as {
      readonly dependencies?: Readonly<Record<string, string>>
    }
    expect(manifest.dependencies?.['@adatechnology/audio-transcription-provider']).toBe('0.1.0')
  })
})
