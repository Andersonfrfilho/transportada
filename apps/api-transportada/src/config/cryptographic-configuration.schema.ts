/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretKeyRing } from '@adatechnology/secret-envelope'

import { CryptographicConfigurationError } from './cryptographic-configuration.error'

const BASE64_32_BYTES_PATTERN = /^[A-Za-z0-9+/]{43}=$/
/** A chave do limitador foi gerada com `openssl rand -hex 32` nos ambientes (spec 191 T7.3). */
const HEX_32_BYTES_PATTERN = /^[0-9a-f]{64}$/
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export type CryptographicConfiguration = {
  readonly envelopeKeyRing: SecretKeyRing
  readonly idempotencyHmacKey: Uint8Array
  /**
   * O módulo de notificações recebe a chave como texto — é ele quem guarda só o HMAC do endereço
   * suprimido. Sem ela, a supressão não casaria com ninguém e o e-mail continuaria saindo para
   * quem já recusou; por isso é obrigatória no boot, e não tem valor padrão.
   */
  readonly notificationSuppressionHmacKey: string
  /** ADR-0076 §3: HMAC da chave do limitador anônimo — IP e alvo nunca chegam em claro ao banco. */
  readonly rateLimitSubjectHmacKey: Uint8Array
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

  const encodedSuppressionKey = requireValue(environment.NOTIFICATION_SUPPRESSION_HMAC_KEY)
  const idempotencyHmacKey = decodeCanonicalKey(encodedHmacKey)
  const suppressionHmacKey = decodeCanonicalKey(encodedSuppressionKey)
  const reservedKeys = [...Object.values(envelopeKeys), idempotencyHmacKey]
  if (Object.values(envelopeKeys).some((key) => keysEqual(key, idempotencyHmacKey))) {
    failConfiguration()
  }
  if (reservedKeys.some((key) => keysEqual(key, suppressionHmacKey))) failConfiguration()

  const rateLimitSubjectHmacKey = decodeHexKey(
    requireValue(environment.RATE_LIMIT_SUBJECT_HMAC_KEY),
  )
  if (
    [...reservedKeys, suppressionHmacKey].some((key) => keysEqual(key, rateLimitSubjectHmacKey))
  ) {
    failConfiguration()
  }

  return {
    envelopeKeyRing: {
      activeKeyId,
      keys: Object.freeze(envelopeKeys),
    },
    idempotencyHmacKey,
    notificationSuppressionHmacKey: encodedSuppressionKey,
    rateLimitSubjectHmacKey,
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

function decodeHexKey(value: string): Uint8Array {
  if (!HEX_32_BYTES_PATTERN.test(value)) failConfiguration()
  return Uint8Array.from(Buffer.from(value, 'hex'))
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
