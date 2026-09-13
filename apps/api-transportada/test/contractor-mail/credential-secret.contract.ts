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

import { createContractorMailCredentialSecretService } from '../../src/contractor-mail/application/contractor-mail-credential-secret.service'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-0000000000c2'
const SETTINGS_ID = '00000000-0000-4000-8000-0000000000c3'
const OTHER_SETTINGS_ID = '00000000-0000-4000-8000-0000000000c4'
const API_KEY = 're_synthetic_resend_api_key'
const WEBHOOK_SIGNING_SECRET = 'whsec_synthetic_svix_secret'
const REPLY_TOKEN_SECRET = 'a'.repeat(64)
const CANONICAL_AAD = `transportada:contractor-mail-credential:v1:${COMPANY_ID}:${SETTINGS_ID}`

const TEXT_ENCODER = new TextEncoder()

describe('contractor mail credential secret envelope contract (spec 143 T006)', () => {
  test('uses canonical tenant AAD and an exact strict plaintext DTO, zeroing the plaintext', async () => {
    let captured: EncryptSecretInput | undefined
    let plaintextReference: Uint8Array | undefined
    const service = createContractorMailCredentialSecretService({
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
    expect(decoded).toEqual({
      apiKey: API_KEY,
      replyTokenSecret: REPLY_TOKEN_SECRET,
      webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
    })
    expect(Object.keys(decoded as object).sort()).toEqual([
      'apiKey',
      'replyTokenSecret',
      'webhookSigningSecret',
    ])
    expect(plaintextReference && [...plaintextReference]).toEqual(
      new Array(plaintextReference?.byteLength ?? 0).fill(0),
    )
  })

  test('round-trips both secrets through a real envelope provider', async () => {
    const service = createContractorMailCredentialSecretService({
      envelopeProvider: realProvider(),
    })

    const envelope = await service.encrypt(secretInput())
    const secret = await service.decrypt({
      companyId: COMPANY_ID,
      envelope,
      settingsId: SETTINGS_ID,
    })

    expect(secret).toEqual({
      apiKey: API_KEY,
      replyTokenSecret: REPLY_TOKEN_SECRET,
      webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
    })
    expect(Object.keys(envelope).sort()).toEqual([
      'algorithm',
      'ciphertext',
      'keyId',
      'nonce',
      'version',
    ])
  })

  /** Trocar a empresa ou a configuração muda o AAD: o mesmo envelope não abre para outro tenant. */
  test('fails closed on cross-tenant AAD, on a different settingsId and on a tampered ciphertext', async () => {
    const service = createContractorMailCredentialSecretService({
      envelopeProvider: realProvider(),
    })
    const envelope = await service.encrypt(secretInput())

    const crossTenant = await captureError(() =>
      service.decrypt({ companyId: OTHER_COMPANY_ID, envelope, settingsId: SETTINGS_ID }),
    )
    const otherSettings = await captureError(() =>
      service.decrypt({ companyId: COMPANY_ID, envelope, settingsId: OTHER_SETTINGS_ID }),
    )
    const tampered = await captureError(() =>
      service.decrypt({
        companyId: COMPANY_ID,
        envelope: { ...envelope, ciphertext: flipFirstCharacter(envelope.ciphertext) },
        settingsId: SETTINGS_ID,
      }),
    )

    for (const error of [crossTenant, otherSettings, tampered]) {
      expectSafeUnavailable(error)
    }
  })

  test('rejects a plaintext carrying fields outside the allowlist and clears provider-owned bytes', async () => {
    let plaintextReference: Uint8Array | undefined
    const service = createContractorMailCredentialSecretService({
      envelopeProvider: {
        async decrypt() {
          plaintextReference = TEXT_ENCODER.encode(
            JSON.stringify({
              apiKey: API_KEY,
              replyTokenSecret: REPLY_TOKEN_SECRET,
              resendAccountId: 'smuggled',
              webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
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
        envelope: syntheticEnvelope(),
        settingsId: SETTINGS_ID,
      }),
    )

    expectSafeUnavailable(error)
    expect(plaintextReference && [...plaintextReference]).toEqual(
      new Array(plaintextReference?.byteLength ?? 0).fill(0),
    )
  })

  test('rejects an envelope with fields outside the allowlist before touching the provider', async () => {
    let decryptCalls = 0
    const service = createContractorMailCredentialSecretService({
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

  /** ADR-0063 §7: o segredo do webhook segue o formato do Svix. Errar isso só apareceria na primeira
   * conferência de assinatura, muito depois de gravado — por isso é recusado ao selar. */
  test('rejects a webhook signing secret without the whsec_ prefix, without touching the provider', async () => {
    let encryptCalls = 0
    const service = createContractorMailCredentialSecretService({
      envelopeProvider: {
        async decrypt() {
          throw new Error('decrypt should not run')
        },
        async encrypt() {
          encryptCalls += 1
          return syntheticEnvelope()
        },
      },
    })

    await expect(
      service.encrypt({ ...secretInput(), webhookSigningSecret: 'sk_not_svix_format' }),
    ).rejects.toMatchObject({
      code: 'CONTRACTOR_MAIL_WEBHOOK_SECRET_FORMAT_INVALID',
      status: 422,
    })
    expect(encryptCalls).toBe(0)
  })

  test('a decrypted secret failing the whsec_ shape is also refused, safely', async () => {
    const service = createContractorMailCredentialSecretService({
      envelopeProvider: {
        async decrypt() {
          return TEXT_ENCODER.encode(
            JSON.stringify({
              apiKey: API_KEY,
              replyTokenSecret: REPLY_TOKEN_SECRET,
              webhookSigningSecret: 'sk_not_svix_format',
            }),
          )
        },
        async encrypt() {
          throw new Error('encrypt should not run')
        },
      },
    })

    const error = await captureError(() =>
      service.decrypt({
        companyId: COMPANY_ID,
        envelope: syntheticEnvelope(),
        settingsId: SETTINGS_ID,
      }),
    )

    expectSafeUnavailable(error)
  })
})

function secretInput() {
  return {
    apiKey: API_KEY,
    companyId: COMPANY_ID,
    replyTokenSecret: REPLY_TOKEN_SECRET,
    settingsId: SETTINGS_ID,
    webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
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
    code: 'CONTRACTOR_MAIL_CREDENTIAL_UNAVAILABLE',
    message: 'Contractor mail credential is unavailable',
    status: 500,
  })
  expect(error).not.toHaveProperty('cause')
  const serialized = `${JSON.stringify(error)}${(error as Error).stack ?? ''}`
  for (const sensitive of [
    API_KEY,
    WEBHOOK_SIGNING_SECRET,
    REPLY_TOKEN_SECRET,
    COMPANY_ID,
    SETTINGS_ID,
  ]) {
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
