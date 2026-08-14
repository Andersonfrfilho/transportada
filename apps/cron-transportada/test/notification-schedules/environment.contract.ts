/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { CronConfigurationError, parseCronEnvironment } from '../../src/config/environment.schema.js'
import { NOTIFICATION_SCHEDULES_JOB } from '../../src/notification-schedules/domain/notification-schedules.constant.js'
import { resolveCronJob } from '../../src/job-registry.js'

const SUPPRESSION_KEY = Buffer.alloc(32, 3).toString('base64')

const BASE_ENVIRONMENT = {
  APP_ENV: 'local',
  CADENCE_MINUTES: '60',
  CRON_JOB: NOTIFICATION_SCHEDULES_JOB,
  DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
  FISCAL_ENVIRONMENT: 'homologation',
  LOG_LEVEL: 'info',
  NOTIFICATION_SUPPRESSION_HMAC_KEY: SUPPRESSION_KEY,
  PAGE_SIZE: '50',
  QUEUE_PREFIX: 'transportada_test',
  RABBITMQ_URL: 'amqp://localhost:55672',
} as const

describe('contrato do job de rotinas de notificação', () => {
  test('o registro conhece o job', () => {
    expect(typeof resolveCronJob(NOTIFICATION_SCHEDULES_JOB)).toBe('function')
  })

  test('a configuração do trilho é resolvida para este job', () => {
    expect(parseCronEnvironment(BASE_ENVIRONMENT).notificationSchedules).toEqual({
      queuePrefix: 'transportada_test',
      rabbitMqUrl: 'amqp://localhost:55672',
      suppressionHmacKey: SUPPRESSION_KEY,
    })
  })

  // O deploy do outro job nunca passa por aqui: ele não fala com o broker de notificação nem
  // consulta supressão.
  test('outro job não exige broker nem chave de supressão', () => {
    expect(
      parseCronEnvironment({
        ...BASE_ENVIRONMENT,
        CRON_JOB: 'nfe.distribution.pull',
        NOTIFICATION_SUPPRESSION_HMAC_KEY: undefined,
        QUEUE_PREFIX: undefined,
        RABBITMQ_URL: undefined,
      }).notificationSchedules,
    ).toBeUndefined()
  })

  // Falhar no boot é preferível a rodar o ciclo e descobrir na primeira entrega que a supressão
  // não casa — aí o e-mail já saiu para quem tinha recusado.
  test.each([
    ['sem broker', { RABBITMQ_URL: undefined }],
    ['sem prefixo de fila', { QUEUE_PREFIX: undefined }],
    ['sem chave de supressão', { NOTIFICATION_SUPPRESSION_HMAC_KEY: undefined }],
    ['com chave de supressão curta', { NOTIFICATION_SUPPRESSION_HMAC_KEY: 'curta' }],
  ])('falha no boot %s', (_name, overrides) => {
    expect(() => parseCronEnvironment({ ...BASE_ENVIRONMENT, ...overrides })).toThrow(
      CronConfigurationError,
    )
  })
})
