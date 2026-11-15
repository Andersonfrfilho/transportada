/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { describeStartupFailure } from '../src/startup-failure.service.js'

describe('describeStartupFailure', () => {
  test('mostra nome, code e mensagem do erro de boot', () => {
    const error = Object.assign(new Error('listen failed'), { code: 'EADDRINUSE' })
    expect(describeStartupFailure(error)).toBe('Error EADDRINUSE listen failed')
  })

  test('mascara credencial de URL', () => {
    const error = new Error('connect amqp://user:pass@rabbit:5672 refused')
    const text = describeStartupFailure(error)
    expect(text).toContain('amqp://***@rabbit:5672')
    expect(text).not.toContain('pass')
  })

  test('valor que não é Error vira só o tipo', () => {
    expect(describeStartupFailure('boom')).toBe('string')
  })
})
