/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import {
  createSecretEnvelopeProvider,
  type EncryptSecretInput,
  type SecretEnvelopeProvider,
} from '@adatechnology/secret-envelope'

import {
  CERTIFICATE_ID,
  COMPANY_ID,
  OTHER_COMPANY_ID,
  SECRET_TEXT,
  SYNTHETIC_CERTIFICATE,
  syntheticEnvelope,
} from '../fixtures/digital-certificate-application.fixture'
import {
  captureApiError,
  createSecretService,
} from '../fixtures/digital-certificate-use-case.fixture'

const CERTIFICATE_BASE64 = Buffer.from(SYNTHETIC_CERTIFICATE).toString('base64')
const PASSWORD = `password:${SECRET_TEXT}`
const CANONICAL_AAD = `transportada:certificate:v1:${COMPANY_ID}:${CERTIFICATE_ID}:cte`

describe('digital certificate secret envelope application contract', () => {
  test('uses canonical tenant AAD and an exact strict plaintext DTO', async () => {
    let captured: EncryptSecretInput | undefined
    let plaintextReference: Uint8Array | undefined
    const service = await createSecretService({
      async decrypt() {
        throw new Error('decrypt should not run')
      },
      async encrypt(input) {
        captured = structuredClone(input)
        plaintextReference = input.plaintext
        return syntheticEnvelope()
      },
    })

    await service.encrypt(secretInput())

    expect(new TextDecoder().decode(captured?.additionalAuthenticatedData)).toBe(CANONICAL_AAD)
    const decoded = JSON.parse(new TextDecoder().decode(captured?.plaintext)) as unknown
    expect(decoded).toEqual({ certificateBase64: CERTIFICATE_BASE64, password: PASSWORD })
    expect(Object.keys(decoded as object).sort()).toEqual(['certificateBase64', 'password'])
    expect(plaintextReference && [...plaintextReference]).toEqual(
      new Array(plaintextReference?.byteLength ?? 0).fill(0),
    )
  })

  test('decrypts only the exact plaintext DTO and clears provider-owned bytes', async () => {
    let plaintextReference: Uint8Array | undefined
    const envelopeProvider = decryptingProvider({
      onPlaintext(plaintext) {
        plaintextReference = plaintext
      },
      plaintext: {
        certificateBase64: CERTIFICATE_BASE64,
        password: PASSWORD,
        unexpected: SECRET_TEXT,
      },
    })
    const service = await createSecretService(envelopeProvider)

    const error = await captureApiError(() => service.decrypt(decryptInput()))

    expectSafeUnavailable(error)
    expect(plaintextReference && [...plaintextReference]).toEqual(
      new Array(plaintextReference?.byteLength ?? 0).fill(0),
    )
  })

  test('fails closed for tenant AAD mismatch and authenticated ciphertext tamper', async () => {
    const envelopeProvider = createSecretEnvelopeProvider({
      activeKeyId: 'test-v1',
      keys: { 'test-v1': Uint8Array.from({ length: 32 }, (_value, index) => index + 1) },
    })
    const service = await createSecretService(envelopeProvider)
    const envelope = await service.encrypt(secretInput())
    const tampered = {
      ...envelope,
      ciphertext: flipBase64UrlCharacter(envelope.ciphertext),
    }

    const crossTenantError = await captureApiError(() =>
      service.decrypt({ ...decryptInput(), companyId: OTHER_COMPANY_ID, envelope }),
    )
    const tamperError = await captureApiError(() =>
      service.decrypt({ ...decryptInput(), envelope: tampered }),
    )

    expectSafeUnavailable(crossTenantError)
    expectSafeUnavailable(tamperError)
  })

  test('round-trips synthetic bytes without broadening the result allowlist', async () => {
    const provider = createSecretEnvelopeProvider({
      activeKeyId: 'test-v1',
      keys: { 'test-v1': crypto.getRandomValues(new Uint8Array(32)) },
    })
    const service = await createSecretService(provider)

    const envelope = await service.encrypt(secretInput())
    const plaintext = await service.decrypt({ ...decryptInput(), envelope })

    expect(plaintext).toEqual({
      certificateBase64: CERTIFICATE_BASE64,
      password: PASSWORD,
    })
    expect(Object.keys(plaintext).sort()).toEqual(['certificateBase64', 'password'])
  })

  test('rejects a provider envelope with fields outside the persistence allowlist', async () => {
    const service = await createSecretService({
      async decrypt() {
        throw new Error('decrypt should not run')
      },
      async encrypt() {
        return { ...syntheticEnvelope(), unexpectedSecret: SECRET_TEXT }
      },
    })

    const error = await captureApiError(() => service.encrypt(secretInput()))

    expectSafeUnavailable(error)
  })
})

function secretInput() {
  return {
    certificateBase64: CERTIFICATE_BASE64,
    certificateId: CERTIFICATE_ID,
    companyId: COMPANY_ID,
    password: PASSWORD,
    purpose: 'cte' as const,
  }
}

function decryptInput() {
  return {
    certificateId: CERTIFICATE_ID,
    companyId: COMPANY_ID,
    envelope: syntheticEnvelope(),
    purpose: 'cte' as const,
  }
}

function decryptingProvider(input: {
  readonly onPlaintext: (plaintext: Uint8Array) => void
  readonly plaintext: unknown
}): SecretEnvelopeProvider {
  return {
    async decrypt() {
      const plaintext = new TextEncoder().encode(JSON.stringify(input.plaintext))
      input.onPlaintext(plaintext)
      return plaintext
    },
    async encrypt() {
      throw new Error('encrypt should not run')
    },
  }
}

function expectSafeUnavailable(error: Error): void {
  expect(error).toMatchObject({
    code: 'DIGITAL_CERTIFICATE_UNAVAILABLE',
    message: 'Digital certificate is unavailable',
    status: 500,
  })
  expect(Object.keys(error).sort()).toEqual(['code', 'headers', 'name', 'status'])
  for (const sensitive of [COMPANY_ID, OTHER_COMPANY_ID, CERTIFICATE_ID, SECRET_TEXT]) {
    expect(JSON.stringify(error)).not.toContain(sensitive)
  }
}

function flipBase64UrlCharacter(value: string): string {
  const first = value[0]
  if (first === undefined) throw new Error('Expected non-empty ciphertext')
  return `${first === 'A' ? 'B' : 'A'}${value.slice(1)}`
}
