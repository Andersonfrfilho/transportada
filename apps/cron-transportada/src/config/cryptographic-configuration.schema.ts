/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia por valor de `apps/worker-transportada/src/config/cryptographic-configuration.schema.ts` —
 * as apps não importam código-fonte uma da outra. O chaveiro tem de ser o mesmo que selou o
 * envelope da credencial, ou a abertura falha no ciclo.
 *
 * Nada do que é validado aqui aparece no erro: a chave é segredo, inclusive quando está torta.
 */
import type { SecretKeyRing } from '@adatechnology/secret-envelope'

import { CronConfigurationError } from './environment.schema.js'

const BASE64_32_BYTES_PATTERN = /^[A-Za-z0-9+/]{43}=$/
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export function parseCronSecretKeyRing(input: {
  readonly encryptionActiveKeyId: string
  readonly encryptionKeyRingJson: string
}): SecretKeyRing {
  try {
    return buildKeyRing(input)
  } catch (error) {
    if (error instanceof CronConfigurationError) throw error
    throw new CronConfigurationError()
  }
}

function buildKeyRing(input: {
  readonly encryptionActiveKeyId: string
  readonly encryptionKeyRingJson: string
}): SecretKeyRing {
  const activeKeyId = parseKeyId(input.encryptionActiveKeyId)
  const keys = parseKeys(input.encryptionKeyRingJson)
  if (!Object.hasOwn(keys, activeKeyId)) failConfiguration()

  return { activeKeyId, keys: Object.freeze(keys) }
}

function parseKeys(value: string): Record<string, Uint8Array> {
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

function parseKeyId(value: string): string {
  if (!KEY_ID_PATTERN.test(value)) failConfiguration()
  return value
}

function failConfiguration(): never {
  throw new CronConfigurationError()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
