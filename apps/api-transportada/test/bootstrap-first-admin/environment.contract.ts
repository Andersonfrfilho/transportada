/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseEnvironment } from '../../src/config/environment.schema.js'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture.js'

const ARRANQUE_TOKEN = 'a'.repeat(48)

describe('bootstrap token environment contract', () => {
  test('reads the arranque token declared in the environment', () => {
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, BOOTSTRAP_TOKEN: ARRANQUE_TOKEN }).bootstrapToken,
    ).toBe(ARRANQUE_TOKEN)
  })

  test('leaves the token undefined when the environment does not declare it', () => {
    expect(parseEnvironment(API_ENVIRONMENT).bootstrapToken).toBeUndefined()
  })

  test('has no default value to fall back to', () => {
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, BOOTSTRAP_TOKEN: undefined }).bootstrapToken,
    ).toBeUndefined()
  })

  test('fails the boot when the token is declared blank', () => {
    for (const token of ['', ' ', '   ', '\t', '\n']) {
      expect(() => parseEnvironment({ ...API_ENVIRONMENT, BOOTSTRAP_TOKEN: token })).toThrow()
    }
  })

  test('never carries the token value into the boot failure message', () => {
    const declared = `${ARRANQUE_TOKEN}   `

    try {
      parseEnvironment({ ...API_ENVIRONMENT, BOOTSTRAP_TOKEN: '   ' })
      throw new Error('expected the blank token to fail the boot')
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(declared.trim())
    }
  })

  test('keeps the declared token byte for byte, without trimming it into a different secret', () => {
    const padded = ` ${ARRANQUE_TOKEN} `

    expect(parseEnvironment({ ...API_ENVIRONMENT, BOOTSTRAP_TOKEN: padded }).bootstrapToken).toBe(
      padded,
    )
  })
})
