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

/**
 * Spec 191 RF12: teto e janela das rotas anônimas de identidade vêm do ambiente, com os padrões da
 * spec. Escopo e store não vêm: são literais da rota.
 */
describe('teto das rotas anônimas de identidade no ambiente (spec 191 T1.3)', () => {
  test('sem declarar, valem os padrões da spec', () => {
    expect(parseEnvironment(API_ENVIRONMENT).identityRateLimits).toEqual({
      loginHintsIp: { maxRequests: 60, windowSeconds: 600 },
      passwordResetConfirmIp: { maxRequests: 20, windowSeconds: 900 },
      passwordResetsIp: { maxRequests: 10, windowSeconds: 900 },
      passwordResetsTarget: { maxRequests: 3, windowSeconds: 3_600 },
      userActivationIp: { maxRequests: 20, windowSeconds: 900 },
    })
  })

  test('lê cada valor declarado', () => {
    const environment = parseEnvironment({
      ...API_ENVIRONMENT,
      RATE_LIMIT_LOGIN_HINTS_IP_MAX: '61',
      RATE_LIMIT_LOGIN_HINTS_IP_WINDOW_SECONDS: '601',
      RATE_LIMIT_PASSWORD_RESET_CONFIRM_IP_MAX: '21',
      RATE_LIMIT_PASSWORD_RESET_CONFIRM_IP_WINDOW_SECONDS: '901',
      RATE_LIMIT_PASSWORD_RESETS_IP_MAX: '11',
      RATE_LIMIT_PASSWORD_RESETS_IP_WINDOW_SECONDS: '902',
      RATE_LIMIT_PASSWORD_RESETS_TARGET_MAX: '4',
      RATE_LIMIT_PASSWORD_RESETS_TARGET_WINDOW_SECONDS: '3601',
      RATE_LIMIT_USER_ACTIVATION_IP_MAX: '22',
      RATE_LIMIT_USER_ACTIVATION_IP_WINDOW_SECONDS: '903',
    })

    expect(environment.identityRateLimits).toEqual({
      loginHintsIp: { maxRequests: 61, windowSeconds: 601 },
      passwordResetConfirmIp: { maxRequests: 21, windowSeconds: 901 },
      passwordResetsIp: { maxRequests: 11, windowSeconds: 902 },
      passwordResetsTarget: { maxRequests: 4, windowSeconds: 3_601 },
      userActivationIp: { maxRequests: 22, windowSeconds: 903 },
    })
  })

  /** Janela acima de um dia seria apagada viva pela limpeza do worker, que só conhece esse teto. */
  test.each([
    ['RATE_LIMIT_LOGIN_HINTS_IP_MAX', '0'],
    ['RATE_LIMIT_PASSWORD_RESETS_TARGET_MAX', '10001'],
    ['RATE_LIMIT_USER_ACTIVATION_IP_MAX', 'vinte'],
    ['RATE_LIMIT_PASSWORD_RESETS_IP_WINDOW_SECONDS', '59'],
    ['RATE_LIMIT_PASSWORD_RESET_CONFIRM_IP_WINDOW_SECONDS', '86401'],
  ])('%s=%s derruba o boot', (name, value) => {
    expect(() => parseEnvironment({ ...API_ENVIRONMENT, [name]: value })).toThrow()
  })
})
