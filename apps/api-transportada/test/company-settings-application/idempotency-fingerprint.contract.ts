/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const TEXT_ENCODER = new TextEncoder()
const HMAC_KEY = Uint8Array.from({ length: 32 }, (_value, index) => index + 1)
const DOMAIN = 'transportada:idempotency:v1'

type FingerprintService = {
  create(input: {
    readonly fields: readonly Uint8Array[]
    readonly operation: string
  }): Promise<string>
}

type CreateFingerprintService = (input: { readonly key: Uint8Array }) => FingerprintService

describe('idempotency fingerprint contract', () => {
  test('uses the canonical domain-separated unsigned-32-bit length framing', async () => {
    const service = await createService(HMAC_KEY)
    const input = {
      fields: [TEXT_ENCODER.encode('company'), TEXT_ENCODER.encode('payload')],
      operation: 'company-settings.update',
    }

    const fingerprint = await service.create(input)
    const expected = await calculateExpectedFingerprint({
      fields: input.fields,
      key: HMAC_KEY,
      operation: input.operation,
    })

    expect(fingerprint).toBe(expected)
    expect(fingerprint).not.toContain('company')
    expect(fingerprint).not.toContain('payload')
  })

  test('prevents concatenation and operation-domain collisions', async () => {
    const service = await createService(HMAC_KEY)
    const first = await service.create({
      fields: [TEXT_ENCODER.encode('ab'), TEXT_ENCODER.encode('c')],
      operation: 'company-settings.update',
    })
    const second = await service.create({
      fields: [TEXT_ENCODER.encode('a'), TEXT_ENCODER.encode('bc')],
      operation: 'company-settings.update',
    })
    const anotherOperation = await service.create({
      fields: [TEXT_ENCODER.encode('ab'), TEXT_ENCODER.encode('c')],
      operation: 'digital-certificate.replace',
    })

    expect(new Set([first, second, anotherOperation]).size).toBe(3)
  })

  test('snapshots the HMAC key instead of retaining caller-owned mutable bytes', async () => {
    const mutableKey = Uint8Array.from(HMAC_KEY)
    const service = await createService(mutableKey)
    mutableKey.fill(0)
    const input = {
      fields: [TEXT_ENCODER.encode('stable-input')],
      operation: 'company-settings.update',
    }

    expect(await service.create(input)).toBe(await (await createService(HMAC_KEY)).create(input))
  })
})

async function createService(key: Uint8Array): Promise<FingerprintService> {
  const module = (await import(
    '../../src/companies/application/idempotency-fingerprint.service.js'
  )) as {
    readonly createIdempotencyFingerprintService: CreateFingerprintService
  }
  return module.createIdempotencyFingerprintService({ key })
}

async function calculateExpectedFingerprint(input: {
  readonly fields: readonly Uint8Array[]
  readonly key: Uint8Array
  readonly operation: string
}): Promise<string> {
  const framed = frame([
    TEXT_ENCODER.encode(DOMAIN),
    TEXT_ENCODER.encode(input.operation),
    ...input.fields,
  ])
  const key = await crypto.subtle.importKey(
    'raw',
    input.key,
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, framed)
  return Buffer.from(signature).toString('base64url')
}

function frame(fields: readonly Uint8Array[]): Uint8Array {
  const size = fields.reduce((total, field) => total + 4 + field.byteLength, 0)
  const framed = new Uint8Array(size)
  const view = new DataView(framed.buffer)
  let offset = 0
  for (const field of fields) {
    view.setUint32(offset, field.byteLength, false)
    offset += 4
    framed.set(field, offset)
    offset += field.byteLength
  }
  return framed
}
