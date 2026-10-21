/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseEnvironment } from '../../src/config/environment.schema'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture'

const SANDBOX_ENVIRONMENT = {
  ...API_ENVIRONMENT,
  CONTRACTOR_MAIL_SANDBOX_SMTP: 'true',
  EMAIL_FROM: 'no-reply@staging.example.test',
} as const

describe('spec 268: o modo sandbox do e-mail da contratante é opt-in e nunca roda em produção', () => {
  test('desligado por padrão', () => {
    const configuration = parseEnvironment(API_ENVIRONMENT)
    expect(configuration.contractorMailSandbox).toBeUndefined()
  })

  test('ligado, carrega o remetente do ambiente', () => {
    expect(parseEnvironment(SANDBOX_ENVIRONMENT).contractorMailSandbox).toEqual({
      fromAddress: 'no-reply@staging.example.test',
    })
  })

  test('declarado como false, segue desligado', () => {
    const configuration = parseEnvironment({
      ...API_ENVIRONMENT,
      CONTRACTOR_MAIL_SANDBOX_SMTP: 'false',
    })
    expect(configuration.contractorMailSandbox).toBeUndefined()
  })

  test('ligado em produção derruba o boot', () => {
    expect(() => parseEnvironment({ ...SANDBOX_ENVIRONMENT, APP_ENV: 'production' })).toThrow()
  })

  test('ligado sem EMAIL_FROM derruba o boot', () => {
    expect(() => parseEnvironment({ ...SANDBOX_ENVIRONMENT, EMAIL_FROM: '' })).toThrow()
  })

  test('valor fora de true/false derruba o boot', () => {
    expect(() =>
      parseEnvironment({ ...API_ENVIRONMENT, CONTRACTOR_MAIL_SANDBOX_SMTP: 'yes' }),
    ).toThrow()
  })
})
