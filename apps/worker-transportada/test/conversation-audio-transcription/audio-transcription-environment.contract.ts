/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.2 (RF16): sem o caminho do modelo a rotina não existe; com ele, as variáveis têm padrão
 * medido na T0.2 e teto de sanidade.
 */
import { describe, expect, test } from 'bun:test'

import {
  parseWorkerEnvironment,
  WorkerConfigurationError,
} from '../../src/config/environment.schema.js'

const BASE = {
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
  FOUNDATION_SYNTHETIC_CONSUMER_ENABLED: 'false',
  LOG_LEVEL: 'info',
  QUEUE_PREFIX: 'transportada_local',
  RABBITMQ_URL: 'amqp://transportada:transportada@localhost:55672',
  WORKER_PORT: '53002',
}

describe('ambiente da transcrição de áudio (spec 264 T3.2)', () => {
  test('sem AUDIO_TRANSCRIPTION_MODEL_PATH não há bloco de transcrição', () => {
    expect(parseWorkerEnvironment(BASE).audioTranscription).toBeUndefined()
    expect(
      parseWorkerEnvironment({ ...BASE, AUDIO_TRANSCRIPTION_MODEL_PATH: '  ' }).audioTranscription,
    ).toBeUndefined()
  })

  test('com o modelo, os padrões são os medidos na T0.2', () => {
    expect(
      parseWorkerEnvironment({
        ...BASE,
        AUDIO_TRANSCRIPTION_MODEL_PATH: '/models/ggml-small-q5_1.bin',
      }).audioTranscription,
    ).toEqual({
      batchSize: 2,
      maxDurationMs: 600_000,
      modelPath: '/models/ggml-small-q5_1.bin',
      recoveryWindowHours: 72,
      timeoutMs: 300_000,
    })
  })

  test('as variáveis são lidas e threads só aparece quando declarada', () => {
    const parsed = parseWorkerEnvironment({
      ...BASE,
      AUDIO_TRANSCRIPTION_BATCH_SIZE: '3',
      AUDIO_TRANSCRIPTION_MAX_DURATION_MS: '300000',
      AUDIO_TRANSCRIPTION_MODEL_PATH: '/models/m.bin',
      AUDIO_TRANSCRIPTION_RECOVERY_WINDOW_HOURS: '24',
      AUDIO_TRANSCRIPTION_THREADS: '7',
      AUDIO_TRANSCRIPTION_TIMEOUT_MS: '120000',
    })
    expect(parsed.audioTranscription).toEqual({
      batchSize: 3,
      maxDurationMs: 300_000,
      modelPath: '/models/m.bin',
      recoveryWindowHours: 24,
      threads: 7,
      timeoutMs: 120_000,
    })
  })

  test('valores fora da faixa derrubam o boot', () => {
    for (const [key, value] of [
      ['AUDIO_TRANSCRIPTION_BATCH_SIZE', '0'],
      ['AUDIO_TRANSCRIPTION_BATCH_SIZE', '21'],
      ['AUDIO_TRANSCRIPTION_MAX_DURATION_MS', '10'],
      ['AUDIO_TRANSCRIPTION_RECOVERY_WINDOW_HOURS', '0'],
      ['AUDIO_TRANSCRIPTION_THREADS', '0'],
      ['AUDIO_TRANSCRIPTION_TIMEOUT_MS', '5'],
    ] as const) {
      expect(() =>
        parseWorkerEnvironment({ ...BASE, AUDIO_TRANSCRIPTION_MODEL_PATH: '/m.bin', [key]: value }),
      ).toThrow(WorkerConfigurationError)
    }
  })
})
