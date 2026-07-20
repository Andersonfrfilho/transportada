/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { IdempotencyFingerprintPort } from './company-settings.port.js'

const DOMAIN = new TextEncoder().encode('transportada:idempotency:v1')
const TEXT_ENCODER = new TextEncoder()
const UINT32_BYTES = 4

export function createIdempotencyFingerprintService(input: {
  readonly key: Uint8Array
}): IdempotencyFingerprintPort {
  const keySnapshot = Uint8Array.from(input.key)
  const cryptographicKey = importHmacKey(keySnapshot)

  return {
    async create({ fields, operation }) {
      const framed = frame([DOMAIN, TEXT_ENCODER.encode(operation), ...fields])
      try {
        const signature = await crypto.subtle.sign('HMAC', await cryptographicKey, framed)
        return Buffer.from(signature).toString('base64url')
      } finally {
        framed.fill(0)
      }
    },
  }
}

async function importHmacKey(key: Uint8Array): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey(
      'raw',
      key,
      {
        hash: 'SHA-256',
        name: 'HMAC',
      },
      false,
      ['sign'],
    )
  } finally {
    key.fill(0)
  }
}

function frame(fields: readonly Uint8Array[]): Uint8Array {
  const byteLength = fields.reduce((total, field) => {
    if (field.byteLength > 0xffff_ffff) {
      throw new RangeError('Idempotency fingerprint field is too large')
    }
    return total + UINT32_BYTES + field.byteLength
  }, 0)
  const framed = new Uint8Array(byteLength)
  const view = new DataView(framed.buffer)
  let offset = 0

  for (const field of fields) {
    view.setUint32(offset, field.byteLength, false)
    offset += UINT32_BYTES
    framed.set(field, offset)
    offset += field.byteLength
  }

  return framed
}
