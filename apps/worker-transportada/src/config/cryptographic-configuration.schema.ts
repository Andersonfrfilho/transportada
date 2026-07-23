/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretKeyRing } from '@adatechnology/secret-envelope'

import { WorkerCryptographicConfigurationError } from './cryptographic-configuration.error.js'

const BASE64_32_BYTES_PATTERN = /^[A-Za-z0-9+/]{43}=$/
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export type WorkerCryptographicConfiguration = {
  readonly envelopeKeyRing: SecretKeyRing
}

export function parseWorkerCryptographicConfiguration(
  environment: Record<string, string | undefined>,
): WorkerCryptographicConfiguration {
  try {
    return parseConfiguration(environment)
  } catch (error) {
    if (error instanceof WorkerCryptographicConfigurationError) throw error
    throw new WorkerCryptographicConfigurationError()
  }
}

function parseConfiguration(
  environment: Record<string, string | undefined>,
): WorkerCryptographicConfiguration {
  const activeKeyId = parseKeyId(environment.ENCRYPTION_ACTIVE_KEY_ID)
  const encodedKeyRing = requireValue(environment.ENCRYPTION_KEYRING_JSON)
  const envelopeKeys = parseKeyRing(encodedKeyRing)
  if (!Object.hasOwn(envelopeKeys, activeKeyId)) failConfiguration()

  return {
    envelopeKeyRing: {
      activeKeyId,
      keys: Object.freeze(envelopeKeys),
    },
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
  throw new WorkerCryptographicConfigurationError()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
