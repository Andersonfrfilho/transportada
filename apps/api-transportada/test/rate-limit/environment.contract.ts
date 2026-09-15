/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseEnvironment } from '../../src/config/environment.schema.js'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture.js'

/** RF18: o teto do e-mail com contratantes vem do ambiente, validado no boot. */
describe('teto do e-mail com contratantes no ambiente (spec 150 T406)', () => {
  test('sem declarar, vale o padrão de 20 por hora', () => {
    expect(parseEnvironment(API_ENVIRONMENT).contractorMailRateLimit).toEqual({
      maxRequests: 20,
      windowSeconds: 3_600,
    })
  })

  test('lê os dois valores declarados', () => {
    const environment = parseEnvironment({
      ...API_ENVIRONMENT,
      RATE_LIMIT_CONTRACTOR_MAIL_MAX: '5',
      RATE_LIMIT_CONTRACTOR_MAIL_WINDOW_SECONDS: '600',
    })

    expect(environment.contractorMailRateLimit).toEqual({ maxRequests: 5, windowSeconds: 600 })
  })

  for (const value of ['0', '10001', '1.5', 'vinte', '']) {
    test(`teto "${value}" derruba o boot`, () => {
      expect(() =>
        parseEnvironment({ ...API_ENVIRONMENT, RATE_LIMIT_CONTRACTOR_MAIL_MAX: value }),
      ).toThrow()
    })
  }

  /** Abaixo de um minuto a janela vira ruído; acima de um dia, a limpeza do worker a apagaria viva. */
  for (const value of ['59', '86401', '3600.5', '']) {
    test(`janela "${value}" derruba o boot`, () => {
      expect(() =>
        parseEnvironment({ ...API_ENVIRONMENT, RATE_LIMIT_CONTRACTOR_MAIL_WINDOW_SECONDS: value }),
      ).toThrow()
    })
  }
})
