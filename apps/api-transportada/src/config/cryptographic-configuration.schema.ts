/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretKeyRing } from '@adatechnology/secret-envelope'

import { CryptographicConfigurationError } from './cryptographic-configuration.error'

const BASE64_32_BYTES_PATTERN = /^[A-Za-z0-9+/]{43}=$/
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export type CryptographicConfiguration = {
  readonly envelopeKeyRing: SecretKeyRing
  readonly idempotencyHmacKey: Uint8Array
}

export function parseCryptographicConfiguration(
  environment: Record<string, string | undefined>,
): CryptographicConfiguration {
  try {
    return parseConfiguration(environment)
  } catch (error) {
    if (error instanceof CryptographicConfigurationError) throw error
    throw new CryptographicConfigurationError()
  }
}

function parseConfiguration(
  environment: Record<string, string | undefined>,
): CryptographicConfiguration {
  const activeKeyId = parseKeyId(environment.ENCRYPTION_ACTIVE_KEY_ID)
  const encodedKeyRing = requireValue(environment.ENCRYPTION_KEYRING_JSON)
  const encodedHmacKey = requireValue(environment.IDEMPOTENCY_HMAC_KEY)
  const envelopeKeys = parseKeyRing(encodedKeyRing)
  if (!Object.hasOwn(envelopeKeys, activeKeyId)) failConfiguration()

  const idempotencyHmacKey = decodeCanonicalKey(encodedHmacKey)
  if (Object.values(envelopeKeys).some((key) => keysEqual(key, idempotencyHmacKey))) {
    failConfiguration()
  }

  return {
    envelopeKeyRing: {
      activeKeyId,
      keys: Object.freeze(envelopeKeys),
    },
    idempotencyHmacKey,
  }
}

function parseKeyRing(value: string): Record<string, Uint8Array> {
  const parsed: unknown = JSON.parse(value)
  if (!isPlainObject(parsed)) failConfiguration()

  const entries = Object.entries(parsed)
  if (entries.length === 0) failConfiguration()

  return Object.fromEntries(
    entries.map(([keyId, encodedKey]) => {
      if (typeof encodedKey !== 'string') failConfiguration()
      return [parseKeyId(keyId), decodeCanonicalKey(encodedKey)]
    }),
  )
}

function decodeCanonicalKey(value: string): Uint8Array {
  if (!BASE64_32_BYTES_PATTERN.test(value)) failConfiguration()
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length !== 32 || decoded.toString('base64') !== value) failConfiguration()
  return Uint8Array.from(decoded)
}

function parseKeyId(value: string | undefined): string {
  const requiredValue = requireValue(value)
  if (!KEY_ID_PATTERN.test(requiredValue)) failConfiguration()
  return requiredValue
}

function requireValue(value: string | undefined): string {
  if (!value) failConfiguration()
  return value
}

function failConfiguration(): never {
  throw new CryptographicConfigurationError()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function keysEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return difference === 0
}
