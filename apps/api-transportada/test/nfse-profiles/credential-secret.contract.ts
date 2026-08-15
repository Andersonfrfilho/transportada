/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import {
  createSecretEnvelopeProvider,
  type EncryptSecretInput,
  type SecretEnvelopeProvider,
  type SecretEnvelopeV1,
} from '@adatechnology/secret-envelope'

import { createNfseCredentialSecretService } from '../../src/nfse-profiles/application/nfse-credential-secret.service'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000b1'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-0000000000b2'
const CREDENTIAL_ID = '00000000-0000-4000-8000-0000000000b3'
const API_TOKEN = 'notarp-synthetic-api-token'
const CALLBACK_TOKEN = 'synthetic-callback-token'
const CANONICAL_AAD = `transportada:nfse-credential:v1:${COMPANY_ID}:${CREDENTIAL_ID}`

const TEXT_ENCODER = new TextEncoder()

describe('NFS-e credential secret envelope contract', () => {
  test('uses canonical tenant AAD and an exact strict plaintext DTO, zeroing the plaintext', async () => {
    let captured: EncryptSecretInput | undefined
    let plaintextReference: Uint8Array | undefined
    const service = createNfseCredentialSecretService({
      envelopeProvider: {
        async decrypt() {
          throw new Error('decrypt should not run')
        },
        async encrypt(input) {
          captured = structuredClone(input)
          plaintextReference = input.plaintext
          return syntheticEnvelope()
        },
      },
    })

    await service.encrypt(secretInput())

    expect(new TextDecoder().decode(captured?.additionalAuthenticatedData)).toBe(CANONICAL_AAD)
    const decoded = JSON.parse(new TextDecoder().decode(captured?.plaintext)) as unknown
    expect(decoded).toEqual({ apiToken: API_TOKEN, callbackToken: CALLBACK_TOKEN })
    expect(Object.keys(decoded as object).sort()).toEqual(['apiToken', 'callbackToken'])
    expect(plaintextReference && [...plaintextReference]).toEqual(
      new Array(plaintextReference?.byteLength ?? 0).fill(0),
    )
  })

  test('round-trips both tokens through a real envelope provider', async () => {
    const service = createNfseCredentialSecretService({
      envelopeProvider: realProvider(),
    })

    const envelope = await service.encrypt(secretInput())
    const secret = await service.decrypt({
      companyId: COMPANY_ID,
      credentialId: CREDENTIAL_ID,
      envelope,
    })

    expect(secret).toEqual({ apiToken: API_TOKEN, callbackToken: CALLBACK_TOKEN })
    expect(Object.keys(envelope).sort()).toEqual([
      'algorithm',
      'ciphertext',
      'keyId',
      'nonce',
      'version',
    ])
  })

  /** Trocar a empresa muda o AAD: o mesmo envelope não abre para outro tenant. */
  test('fails closed on cross-tenant AAD and on a tampered ciphertext, leaking nothing', async () => {
    const service = createNfseCredentialSecretService({ envelopeProvider: realProvider() })
    const envelope = await service.encrypt(secretInput())

    const crossTenant = await captureError(() =>
      service.decrypt({ companyId: OTHER_COMPANY_ID, credentialId: CREDENTIAL_ID, envelope }),
    )
    const tampered = await captureError(() =>
      service.decrypt({
        companyId: COMPANY_ID,
        credentialId: CREDENTIAL_ID,
        envelope: { ...envelope, ciphertext: flipFirstCharacter(envelope.ciphertext) },
      }),
    )

    for (const error of [crossTenant, tampered]) {
      expectSafeUnavailable(error)
    }
  })

  test('rejects a plaintext carrying fields outside the allowlist and clears provider-owned bytes', async () => {
    let plaintextReference: Uint8Array | undefined
    const service = createNfseCredentialSecretService({
      envelopeProvider: {
        async decrypt() {
          plaintextReference = TEXT_ENCODER.encode(
            JSON.stringify({
              apiToken: API_TOKEN,
              callbackToken: CALLBACK_TOKEN,
              certificatePassword: 'smuggled',
            }),
          )
          return plaintextReference
        },
        async encrypt() {
          throw new Error('encrypt should not run')
        },
      },
    })

    const error = await captureError(() =>
      service.decrypt({
        companyId: COMPANY_ID,
        credentialId: CREDENTIAL_ID,
        envelope: syntheticEnvelope(),
      }),
    )

    expectSafeUnavailable(error)
    expect(plaintextReference && [...plaintextReference]).toEqual(
      new Array(plaintextReference?.byteLength ?? 0).fill(0),
    )
  })

  test('rejects an envelope with fields outside the allowlist before touching the provider', async () => {
    let decryptCalls = 0
    const service = createNfseCredentialSecretService({
      envelopeProvider: {
        async decrypt() {
          decryptCalls += 1
          return TEXT_ENCODER.encode('{}')
        },
        async encrypt() {
          return { ...syntheticEnvelope(), keyRing: 'smuggled' } as unknown as SecretEnvelopeV1
        },
      },
    })

    const error = await captureError(() => service.encrypt(secretInput()))

    expectSafeUnavailable(error)
    expect(decryptCalls).toBe(0)
  })
})

function secretInput() {
  return {
    apiToken: API_TOKEN,
    callbackToken: CALLBACK_TOKEN,
    companyId: COMPANY_ID,
    credentialId: CREDENTIAL_ID,
  }
}

function realProvider(): SecretEnvelopeProvider {
  return createSecretEnvelopeProvider({
    activeKeyId: 'test-v1',
    keys: { 'test-v1': Uint8Array.from({ length: 32 }, (_value, index) => index + 1) },
  })
}

function syntheticEnvelope(): SecretEnvelopeV1 {
  return {
    algorithm: 'A256GCM',
    ciphertext: 'c3ludGhldGljLWNpcGhlcnRleHQ',
    keyId: 'test-v1',
    nonce: 'c3ludGhldGljLW5vbmNl',
    version: 1,
  }
}

function flipFirstCharacter(value: string): string {
  const first = value.slice(0, 1)
  return `${first === 'A' ? 'B' : 'A'}${value.slice(1)}`
}

function expectSafeUnavailable(error: unknown): void {
  expect(error).toMatchObject({
    code: 'NFSE_CREDENTIAL_UNAVAILABLE',
    message: 'NFS-e provider credential is unavailable',
    status: 500,
  })
  expect(error).not.toHaveProperty('cause')
  const serialized = `${JSON.stringify(error)}${(error as Error).stack ?? ''}`
  for (const sensitive of [API_TOKEN, CALLBACK_TOKEN, COMPANY_ID, CREDENTIAL_ID]) {
    expect(serialized).not.toContain(sensitive)
  }
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
  } catch (error: unknown) {
    return error
  }

  throw new Error('Expected operation to fail')
}
