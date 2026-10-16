/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  parseWorkerEnvironment,
  WorkerConfigurationError,
} from '../src/config/environment.schema.js'

const validEnvironment = {
  APP_ENV: 'staging',
  DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
  FOUNDATION_SYNTHETIC_CONSUMER_ENABLED: 'false',
  LOG_LEVEL: 'info',
  QUEUE_PREFIX: 'transportada_staging',
  RABBITMQ_URL: 'amqp://transportada:transportada@localhost:55672',
  WORKER_PORT: '53002',
}

const sandboxEnvironment = {
  ...validEnvironment,
  CONTRACTOR_MAIL_SANDBOX_SMTP: 'true',
  EMAIL_FROM: 'no-reply@staging.example.test',
  SMTP_URL: 'smtp://mailpit.internal:1025',
}

describe('spec 268: o modo sandbox do e-mail da contratante no worker', () => {
  test('desligado por padrão', () => {
    expect(parseWorkerEnvironment(validEnvironment).contractorMailSandbox).toBeUndefined()
  })

  test('ligado, carrega o SMTP e o remetente do ambiente', () => {
    expect(parseWorkerEnvironment(sandboxEnvironment).contractorMailSandbox).toEqual({
      from: 'no-reply@staging.example.test',
      smtpUrl: 'smtp://mailpit.internal:1025',
    })
  })

  test('ligado em produção derruba o boot', () => {
    expect(() => parseWorkerEnvironment({ ...sandboxEnvironment, APP_ENV: 'production' })).toThrow(
      WorkerConfigurationError,
    )
  })

  test('ligado sem SMTP_URL derruba o boot, mesmo com o Resend configurado', () => {
    expect(() =>
      parseWorkerEnvironment({
        ...sandboxEnvironment,
        RESEND_API_KEY: 're_test_key',
        SMTP_URL: undefined,
      }),
    ).toThrow(WorkerConfigurationError)
  })

  test('ligado sem EMAIL_FROM derruba o boot', () => {
    expect(() =>
      parseWorkerEnvironment({ ...sandboxEnvironment, EMAIL_FROM: undefined, SMTP_URL: undefined }),
    ).toThrow(WorkerConfigurationError)
  })

  test('valor fora de true/false derruba o boot', () => {
    expect(() =>
      parseWorkerEnvironment({ ...validEnvironment, CONTRACTOR_MAIL_SANDBOX_SMTP: 'yes' }),
    ).toThrow(WorkerConfigurationError)
  })
})
