/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { CronConfigurationError, parseCronEnvironment } from '../src/config/environment.schema.js'

const validEnvironment = {
  APP_ENV: 'local',
  CADENCE_MINUTES: '60',
  CRON_JOB: 'nfe.distribution.pull',
  DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
  FISCAL_ENVIRONMENT: 'homologation',
  LOG_LEVEL: 'info',
  PAGE_SIZE: '50',
}

describe('cron environment contract', () => {
  test('parses the autonomous Bun cron configuration', () => {
    expect(parseCronEnvironment(validEnvironment)).toEqual({
      appEnv: 'local',
      cadenceMinutes: 60,
      cronJob: 'nfe.distribution.pull',
      databaseUrl: validEnvironment.DATABASE_URL,
      fiscalEnvironment: 'homologation',
      logLevel: 'info',
      // O deploy da busca de notas continua subindo sem chaveiro, sem bucket e sem prefeitura.
      nfseStatusPull: undefined,
      notificationSchedules: undefined,
      pageSize: 50,
      logSinkUrl: undefined,
      sentryDsn: undefined,
      sentryEnvironment: 'local',
    })
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

  test('rejects an unknown cron job before any database work', () => {
    expect(() =>
      parseCronEnvironment({ ...validEnvironment, CRON_JOB: 'nfe.unknown.job' }),
    ).toThrow(CronConfigurationError)
  })

  test('rejects an unsupported fiscal environment', () => {
    expect(() =>
      parseCronEnvironment({ ...validEnvironment, FISCAL_ENVIRONMENT: 'staging' }),
    ).toThrow(CronConfigurationError)
  })

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
