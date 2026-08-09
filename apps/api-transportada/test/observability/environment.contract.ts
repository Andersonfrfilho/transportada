/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseEnvironment } from '../../src/config/environment.schema.js'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture.js'

const DSN = 'https://public@glitchtip.exemplo/42'
const SINK_URL = 'https://vector.exemplo/logs'

describe('contrato das variáveis de observabilidade da API', () => {
  test('sem SENTRY_DSN o rastreio nasce desligado e o ambiente cai no APP_ENV', () => {
    const config = parseEnvironment(API_ENVIRONMENT)

    expect(config.sentryDsn).toBeUndefined()
    expect(config.sentryEnvironment).toBe(config.appEnv)
  })

  test('SENTRY_DSN em branco é ausência de configuração, não defeito', () => {
    expect(parseEnvironment({ ...API_ENVIRONMENT, SENTRY_DSN: '   ' }).sentryDsn).toBeUndefined()
  })

  test('SENTRY_DSN torto derruba o boot em vez de rastrear no vazio', () => {
    expect(() => parseEnvironment({ ...API_ENVIRONMENT, SENTRY_DSN: 'nao-e-url' })).toThrow()
  })

  test('SENTRY_ENVIRONMENT sobrepõe o APP_ENV quando declarado', () => {
    const config = parseEnvironment({
      ...API_ENVIRONMENT,
      SENTRY_DSN: DSN,
      SENTRY_ENVIRONMENT: 'staging',
    })

    expect(config.sentryDsn).toBe(DSN)
    expect(config.sentryEnvironment).toBe('staging')
  })

  test('SENTRY_ENVIRONMENT declarado e vazio cai no APP_ENV, sem derrubar o boot', () => {
    const config = parseEnvironment({ ...API_ENVIRONMENT, SENTRY_ENVIRONMENT: '   ' })

    expect(config.sentryEnvironment).toBe(config.appEnv)
  })

  test('sem LOG_SINK_URL o transporte HTTP do log nasce desligado', () => {
    expect(parseEnvironment(API_ENVIRONMENT).logSinkUrl).toBeUndefined()
    expect(parseEnvironment({ ...API_ENVIRONMENT, LOG_SINK_URL: '   ' }).logSinkUrl).toBeUndefined()
  })

  test('LOG_SINK_URL torto derruba o boot em vez de engolir log em silêncio', () => {
    expect(() => parseEnvironment({ ...API_ENVIRONMENT, LOG_SINK_URL: 'nao-e-url' })).toThrow()
  })

  test('LOG_SINK_URL válido chega inteiro na configuração', () => {
    expect(parseEnvironment({ ...API_ENVIRONMENT, LOG_SINK_URL: SINK_URL }).logSinkUrl).toBe(
      SINK_URL,
    )
  })
})
