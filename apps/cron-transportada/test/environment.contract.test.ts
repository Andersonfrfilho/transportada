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
      pageSize: 50,
    })
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
