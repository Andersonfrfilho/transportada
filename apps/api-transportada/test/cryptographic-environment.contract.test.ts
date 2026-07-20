/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CRYPTOGRAPHIC_CONFIGURATION_ERROR_CODE,
  CryptographicConfigurationError,
} from '../src/config/cryptographic-configuration.error'
import { parseEnvironment } from '../src/config/environment.schema'
import {
  ACTIVE_ENCRYPTION_KEY,
  API_ENVIRONMENT,
  CRYPTOGRAPHIC_ENVIRONMENT,
  IDEMPOTENCY_HMAC_KEY,
  PREVIOUS_ENCRYPTION_KEY,
} from './fixtures/cryptographic-environment.fixture'

describe('cryptographic environment contract', () => {
  test('decodes an explicit active AES keyring and separate HMAC key', () => {
    const configuration = parseEnvironment(API_ENVIRONMENT).cryptography

    expect(configuration.envelopeKeyRing.activeKeyId).toBe('local-v2')
    expect(configuration.envelopeKeyRing.keys['local-v2']).toEqual(
      Uint8Array.from(Buffer.from(ACTIVE_ENCRYPTION_KEY, 'base64')),
    )
    expect(configuration.idempotencyHmacKey).toEqual(
      Uint8Array.from(Buffer.from(IDEMPOTENCY_HMAC_KEY, 'base64')),
    )
  })

  test.each([
    {
      name: 'missing active key id',
      overrides: { ENCRYPTION_ACTIVE_KEY_ID: undefined },
    },
    {
      name: 'empty active key id',
      overrides: { ENCRYPTION_ACTIVE_KEY_ID: '' },
    },
    {
      name: 'missing keyring',
      overrides: { ENCRYPTION_KEYRING_JSON: undefined },
    },
    {
      name: 'empty keyring',
      overrides: { ENCRYPTION_KEYRING_JSON: '{}' },
    },
    {
      name: 'malformed keyring JSON',
      overrides: { ENCRYPTION_KEYRING_JSON: '{"local-v2":' },
    },
    {
      name: 'array keyring',
      overrides: { ENCRYPTION_KEYRING_JSON: '[]' },
    },
    {
      name: 'nested keyring value',
      overrides: { ENCRYPTION_KEYRING_JSON: '{"local-v2":{"key":"invalid"}}' },
    },
    {
      name: 'unknown active key',
      overrides: { ENCRYPTION_ACTIVE_KEY_ID: 'unknown-key' },
    },
    {
      name: 'inherited constructor active key',
      overrides: { ENCRYPTION_ACTIVE_KEY_ID: 'constructor' },
    },
    {
      name: 'inherited toString active key',
      overrides: { ENCRYPTION_ACTIVE_KEY_ID: 'toString' },
    },
    {
      name: 'missing HMAC key',
      overrides: { IDEMPOTENCY_HMAC_KEY: undefined },
    },
    {
      name: 'empty HMAC key',
      overrides: { IDEMPOTENCY_HMAC_KEY: '' },
    },
  ])('fails closed for $name', ({ overrides }) => {
    expectConfigurationFailure({ ...API_ENVIRONMENT, ...overrides })
  })

  test.each([
    ['short key', Buffer.alloc(31, 4).toString('base64')],
    ['long key', Buffer.alloc(33, 4).toString('base64')],
    ['unpadded key', Buffer.alloc(32, 4).toString('base64').replace(/=$/, '')],
    ['base64url key', `${'_'.repeat(43)}=`],
    ['whitespace key', ` ${Buffer.alloc(32, 4).toString('base64')}`],
  ])('rejects a non-canonical 32-byte %s', (_name, invalidKey) => {
    expectConfigurationFailure({
      ...API_ENVIRONMENT,
      IDEMPOTENCY_HMAC_KEY: invalidKey,
    })
  })

  test.each([
    ['short', Buffer.alloc(31, 4).toString('base64')],
    ['long', Buffer.alloc(33, 4).toString('base64')],
    ['non-canonical', Buffer.alloc(32, 4).toString('base64').replace(/=$/, '')],
  ])('rejects a %s AES key', (_name, invalidKey) => {
    expectConfigurationFailure({
      ...API_ENVIRONMENT,
      ENCRYPTION_KEYRING_JSON: JSON.stringify({ 'local-v2': invalidKey }),
    })
  })

  test.each([ACTIVE_ENCRYPTION_KEY, PREVIOUS_ENCRYPTION_KEY])(
    'rejects reuse of HMAC material as any envelope key',
    (envelopeKey) => {
      expectConfigurationFailure({
        ...API_ENVIRONMENT,
        IDEMPOTENCY_HMAC_KEY: envelopeKey,
      })
    },
  )

  test('returns one typed generic error without configuration values', () => {
    const exposedValue = 'secret-value-that-must-not-escape'
    const error = captureConfigurationError({
      ...API_ENVIRONMENT,
      ...CRYPTOGRAPHIC_ENVIRONMENT,
      ENCRYPTION_KEYRING_JSON: exposedValue,
    })
    const serializedError = `${error.name}:${error.message}:${JSON.stringify(error)}`

    expect(error).toBeInstanceOf(CryptographicConfigurationError)
    expect(error.code).toBe(CRYPTOGRAPHIC_CONFIGURATION_ERROR_CODE)
    expect(serializedError).not.toContain(exposedValue)
    expect(serializedError).not.toContain(ACTIVE_ENCRYPTION_KEY)
    expect(serializedError).not.toContain(IDEMPOTENCY_HMAC_KEY)
  })
})

function expectConfigurationFailure(environment: Record<string, string | undefined>): void {
  expect(() => parseEnvironment(environment)).toThrow(CryptographicConfigurationError)
}

function captureConfigurationError(
  environment: Record<string, string | undefined>,
): CryptographicConfigurationError {
  try {
    parseEnvironment(environment)
  } catch (error) {
    if (error instanceof CryptographicConfigurationError) return error
  }
  throw new Error('Expected cryptographic configuration to fail')
}
