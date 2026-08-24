/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CronConfigurationError,
  parseCronEnvironment,
} from '../../src/config/environment.schema.js'

const SUPPRESSION_KEY = Buffer.alloc(32, 3).toString('base64')

const BASE_ENVIRONMENT = {
  APP_ENV: 'local',
  CADENCE_MINUTES: '60',
  DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
  FISCAL_ENVIRONMENT: 'homologation',
  LOG_LEVEL: 'info',
  NOTIFICATION_SUPPRESSION_HMAC_KEY: SUPPRESSION_KEY,
  PAGE_SIZE: '50',
  QUEUE_PREFIX: 'transportada_test',
  RABBITMQ_URL: 'amqp://localhost:55672',
} as const

/** A rotina de NFS-e exige o bloco dela; aqui ele é só cenário para o trilho de aviso. */
const NFSE_SETTINGS = {
  ENCRYPTION_ACTIVE_KEY_ID: 'k1',
  ENCRYPTION_KEYRING_JSON: JSON.stringify({ k1: Buffer.alloc(32, 7).toString('base64') }),
  NFSE_PROVIDER_BASE_URL: 'https://www.notarp.com.br/api/v2',
  STORAGE_ACCESS_KEY: 'access',
  STORAGE_BUCKET: 'transportada',
  STORAGE_ENDPOINT: 'http://localhost:59000',
  STORAGE_SECRET_KEY: 'secret',
} as const

describe('contrato do trilho de aviso das rotinas', () => {
  test('a configuração do trilho é resolvida com a chave de supressão declarada', () => {
    expect(parseCronEnvironment(BASE_ENVIRONMENT).notificationSchedules).toEqual({
      queuePrefix: 'transportada_test',
      rabbitMqUrl: 'amqp://localhost:55672',
      suppressionHmacKey: SUPPRESSION_KEY,
    })
  })

  /**
   * Sem `CRON_JOB` quem diz que o trilho de aviso existe é a **presença da chave de supressão** —
   * o broker não serve de sinal, porque a batida sempre publica e por isso sempre o exige. Ausente,
   * a instalação roda calada: o ciclo grava no banco e nada sai por e-mail.
   */
  test('sem chave de supressão o trilho de aviso nasce desligado', () => {
    expect(
      parseCronEnvironment({
        ...BASE_ENVIRONMENT,
        NOTIFICATION_SUPPRESSION_HMAC_KEY: undefined,
      }).notificationSchedules,
    ).toBeUndefined()
  })

  /**
   * A reconciliação de NFS-e avisa quem pediu a nota quando a prefeitura recusa, e é o mesmo trilho.
   * Configurada a chave, o aviso sai; ausente, a reconciliação roda calada — sem este ramo o
   * notificador nunca era construído e a rejeição morria só no banco.
   */
  test('a rotina de NFS-e enxerga o mesmo trilho de aviso', () => {
    expect(
      parseCronEnvironment({ ...BASE_ENVIRONMENT, ...NFSE_SETTINGS }).notificationSchedules,
    ).toEqual({
      queuePrefix: 'transportada_test',
      rabbitMqUrl: 'amqp://localhost:55672',
      suppressionHmacKey: SUPPRESSION_KEY,
    })
  })

  // Falhar no boot é preferível a rodar o ciclo e descobrir na primeira entrega que a supressão
  // não casa — aí o e-mail já saiu para quem tinha recusado.
  test('chave de supressão curta falha no boot em vez de virar supressão que não casa', () => {
    expect(() =>
      parseCronEnvironment({ ...BASE_ENVIRONMENT, NOTIFICATION_SUPPRESSION_HMAC_KEY: 'curta' }),
    ).toThrow(CronConfigurationError)
  })
})
