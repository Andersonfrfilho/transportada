import { describe, expect, it } from 'vitest'
import { EnvironmentValidationError, parseEnvironment } from '../src/index.js'

const minimumEnvironment = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/transportada',
  REDIS_URL: 'redis://localhost:6379',
}

describe('parseEnvironment', () => {
  it('applies safe local defaults', () => {
    const env = parseEnvironment(minimumEnvironment)

    expect(env.APP_ENV).toBe('local')
    expect(env.FISCAL_DEFAULT_ENVIRONMENT).toBe('homologation')
    expect(env.FISCAL_REAL_ISSUANCE_ENABLED).toBe(false)
  })

  it('rejects a production fiscal environment outside production', () => {
    expect(() =>
      parseEnvironment({
        ...minimumEnvironment,
        APP_ENV: 'staging',
        FISCAL_DEFAULT_ENVIRONMENT: 'production',
      }),
    ).toThrow(EnvironmentValidationError)
  })

  it('requires an environment-specific production queue prefix', () => {
    expect(() =>
      parseEnvironment({
        ...minimumEnvironment,
        APP_ENV: 'production',
        FISCAL_DEFAULT_ENVIRONMENT: 'production',
        QUEUE_PREFIX: 'shared',
      }),
    ).toThrow(/QUEUE_PREFIX/)
  })
})
