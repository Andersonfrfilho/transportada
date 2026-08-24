/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { CronConfigurationError, parseCronEnvironment } from '../src/config/environment.schema.js'

const fuelEnvironment = {
  ANEEL_BASE_URL: 'https://dadosabertos.aneel.gov.br',
  ANP_BASE_URL: 'https://www.gov.br/anp',
} as const

const validEnvironment = {
  APP_ENV: 'local',
  CADENCE_MINUTES: '60',
  DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
  FISCAL_ENVIRONMENT: 'homologation',
  LOG_LEVEL: 'info',
  PAGE_SIZE: '50',
  QUEUE_PREFIX: 'transportada_local',
  RABBITMQ_URL: 'amqp://transportada:transportada@localhost:55672',
}

describe('cron environment contract', () => {
  test('parses the tick configuration', () => {
    expect(parseCronEnvironment(validEnvironment)).toEqual({
      appEnv: 'local',
      cadenceMinutes: 60,
      databaseUrl: validEnvironment.DATABASE_URL,
      fiscalEnvironment: 'homologation',
      // Nem sem o endereço da ANP, que só o trilho de preço de combustível usa.
      fuelPricePull: undefined,
      logLevel: 'info',
      notificationSchedules: undefined,
      pageSize: 50,
      queuePrefix: validEnvironment.QUEUE_PREFIX,
      rabbitMqUrl: validEnvironment.RABBITMQ_URL,
      logSinkUrl: undefined,
      sentryDsn: undefined,
      sentryEnvironment: 'local',
    })
  })

  /**
   * O litro e o kWh são coletados pelo mesmo job, então o deploy dele precisa dos dois endereços.
   * Variável opcional no schema faria a metade esquecida virar tela sem preço, em silêncio.
   */
  test('o job de combustível resolve os dois provedores, com a espera padrão', () => {
    expect(parseCronEnvironment({ ...validEnvironment, ...fuelEnvironment }).fuelPricePull).toEqual(
      {
        aneelBaseUrl: fuelEnvironment.ANEEL_BASE_URL,
        aneelTimeoutMilliseconds: 15_000,
        anpBaseUrl: fuelEnvironment.ANP_BASE_URL,
        anpTimeoutMilliseconds: 15_000,
      },
    )
  })

  test('o job de combustível não sobe sem o endereço da ANEEL', () => {
    expect(() =>
      parseCronEnvironment({ ...validEnvironment, ...fuelEnvironment, ANEEL_BASE_URL: '  ' }),
    ).toThrow(CronConfigurationError)
  })

  test('o job de combustível não sobe sem o endereço da ANP', () => {
    expect(() =>
      parseCronEnvironment({ ...validEnvironment, ...fuelEnvironment, ANP_BASE_URL: '  ' }),
    ).toThrow(CronConfigurationError)
  })

  test('sem LOG_SINK_URL o transporte HTTP do log nasce desligado', () => {
    expect(
      parseCronEnvironment({ ...validEnvironment, LOG_SINK_URL: '  ' }).logSinkUrl,
    ).toBeUndefined()
  })

  test('LOG_SINK_URL torto falha o boot em vez de engolir log em silêncio', () => {
    expect(() => parseCronEnvironment({ ...validEnvironment, LOG_SINK_URL: 'nao-e-url' })).toThrow(
      CronConfigurationError,
    )
  })

  test('LOG_SINK_URL válido chega inteiro na configuração', () => {
    const sinkUrl = 'https://vector.exemplo/logs'

    expect(parseCronEnvironment({ ...validEnvironment, LOG_SINK_URL: sinkUrl }).logSinkUrl).toBe(
      sinkUrl,
    )
  })

  test('SENTRY_ENVIRONMENT declarado e vazio cai no APP_ENV, sem derrubar o boot', () => {
    const config = parseCronEnvironment({ ...validEnvironment, SENTRY_ENVIRONMENT: '   ' })

    expect(config.sentryEnvironment).toBe(config.appEnv)
  })

  test('sem SENTRY_DSN o rastreio de erro nasce desligado', () => {
    expect(
      parseCronEnvironment({ ...validEnvironment, SENTRY_DSN: '  ' }).sentryDsn,
    ).toBeUndefined()
  })

  test('SENTRY_DSN preenchido e torto falha o boot em vez de sumir', () => {
    expect(() => parseCronEnvironment({ ...validEnvironment, SENTRY_DSN: 'nao-e-url' })).toThrow(
      CronConfigurationError,
    )
  })

  test('defaults the page size when the variable is absent', () => {
    const withoutPageSize: Record<string, string | undefined> = { ...validEnvironment }
    delete withoutPageSize.PAGE_SIZE
    expect(parseCronEnvironment(withoutPageSize).pageSize).toBe(50)
  })

  test('defaults the cadence to the cron schedule window when absent', () => {
    const withoutCadence: Record<string, string | undefined> = { ...validEnvironment }
    delete withoutCadence.CADENCE_MINUTES
    expect(parseCronEnvironment(withoutCadence).cadenceMinutes).toBe(60)
  })

  /**
   * A batida publica: cron que não alcança o broker não tem o que fazer, e descobrir isso no
   * primeiro `publish` é ciclo com execução já aberta e rotina travada.
   */
  test('a batida não sobe sem o endereço do broker', () => {
    expect(() => parseCronEnvironment({ ...validEnvironment, RABBITMQ_URL: '  ' })).toThrow(
      CronConfigurationError,
    )
  })

  test('a batida não sobe sem o prefixo de fila', () => {
    expect(() => parseCronEnvironment({ ...validEnvironment, QUEUE_PREFIX: '  ' })).toThrow(
      CronConfigurationError,
    )
  })

  test('rejects an unsupported fiscal environment', () => {
    expect(() =>
      parseCronEnvironment({ ...validEnvironment, FISCAL_ENVIRONMENT: 'staging' }),
    ).toThrow(CronConfigurationError)
  })

  /**
   * A reconciliação de NFS-e é do worker, e o bloco de configuração dela se mudou junto: aqui não
   * há mais chaveiro, bucket nem endereço de prefeitura. O que ainda exige `FISCAL_ENVIRONMENT` é a
   * batida, que o repassa a quem consome — o teste acima é o que resta dele nesta app.
   */
  test('does not expose connection credentials in configuration errors', () => {
    const secret = 'do-not-leak'

    try {
      parseCronEnvironment({ ...validEnvironment, DATABASE_URL: `invalid://${secret}@private` })
      throw new Error('Expected environment parsing to fail')
    } catch (error: unknown) {
      expect(String(error)).not.toContain(secret)
    }
  })
})
