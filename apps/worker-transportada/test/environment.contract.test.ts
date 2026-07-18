/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  parseWorkerEnvironment,
  WorkerConfigurationError,
} from '../src/config/environment.schema.js'

const validEnvironment = {
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
  FOUNDATION_SYNTHETIC_CONSUMER_ENABLED: 'false',
  LOG_LEVEL: 'info',
  QUEUE_PREFIX: 'transportada_local',
  RABBITMQ_URL: 'amqp://transportada:transportada@localhost:55672',
  WORKER_PORT: '53002',
}

describe('worker environment contract', () => {
  test('parses the autonomous Bun worker configuration', () => {
    expect(parseWorkerEnvironment(validEnvironment)).toEqual({
      appEnv: 'local',
      databaseUrl: validEnvironment.DATABASE_URL,
      foundationSyntheticConsumerEnabled: false,
      foundationSyntheticEffectDelayMs: 0,
      logLevel: 'info',
      port: 53_002,
      prefetch: 1,
      queuePrefix: 'transportada_local',
      rabbitMqUrl: validEnvironment.RABBITMQ_URL,
    })
  })

  test('forbids the foundation synthetic consumer in production', () => {
    expect(() =>
      parseWorkerEnvironment({
        ...validEnvironment,
        APP_ENV: 'production',
        FOUNDATION_SYNTHETIC_CONSUMER_ENABLED: 'true',
      }),
    ).toThrow(WorkerConfigurationError)
  })

  test('does not expose connection credentials in configuration errors', () => {
    const secret = 'do-not-leak'

    try {
      parseWorkerEnvironment({
        ...validEnvironment,
        DATABASE_URL: `invalid://${secret}@private`,
      })
      throw new Error('Expected environment parsing to fail')
    } catch (error: unknown) {
      expect(String(error)).not.toContain(secret)
    }
  })
})
