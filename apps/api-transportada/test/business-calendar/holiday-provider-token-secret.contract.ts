/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T3.2 (ADR-0102 D5, RF2): a chave da FeriadosAPI selada com o chaveiro de aplicação. O AAD amarra o
 * envelope à LINHA (`settingsId`), o plaintext é `{"token":"…"}` com `.strict()` e a mesma regex nas duas pontas,
 * os bytes em claro são zerados e nenhuma falha devolve a chave, o id ou o motivo do cofre.
 */
import { describe, expect, test } from 'bun:test'
import {
  createSecretEnvelopeProvider,
  type EncryptSecretInput,
  type SecretEnvelopeProvider,
  type SecretEnvelopeV1,
} from '@adatechnology/secret-envelope'

import { createHolidayProviderTokenSecretService } from '../../src/business-calendar/application/holiday-provider-token-secret.service.js'

const SETTINGS_ID = '00000000-0000-4000-8000-0000000262a1'
const OTHER_SETTINGS_ID = '00000000-0000-4000-8000-0000000262a2'
const TOKEN = 'fake-feriadosapi-key-0123456789'
const CANONICAL_AAD = `transportada:holiday-provider-token:v1:${SETTINGS_ID}`

const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

function zeros(reference: Uint8Array | undefined): number[] {
  return new Array<number>(reference?.byteLength ?? 0).fill(0)
}

describe('holiday provider token secret envelope contract (spec 262 T3.2)', () => {
  test('uses the canonical row AAD and an exact strict plaintext, zeroing the plaintext', async () => {
    let captured: EncryptSecretInput | undefined
    let plaintextReference: Uint8Array | undefined
    const service = createHolidayProviderTokenSecretService({
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

    await service.encrypt({ settingsId: SETTINGS_ID, token: TOKEN })

    expect(TEXT_DECODER.decode(captured?.additionalAuthenticatedData)).toBe(CANONICAL_AAD)
    expect(JSON.parse(TEXT_DECODER.decode(captured?.plaintext)) as unknown).toEqual({
      token: TOKEN,
    })
    expect(plaintextReference && [...plaintextReference]).toEqual(zeros(plaintextReference))
  })

  test('round-trips the token through a real envelope provider and exposes only the envelope fields', async () => {
    const service = createHolidayProviderTokenSecretService({ envelopeProvider: realProvider() })

    const envelope = await service.encrypt({ settingsId: SETTINGS_ID, token: TOKEN })

    expect(await service.decrypt({ envelope, settingsId: SETTINGS_ID })).toBe(TOKEN)
    expect(Object.keys(envelope).sort()).toEqual([
      'algorithm',
      'ciphertext',
      'keyId',
      'nonce',
      'version',
    ])
    expect(JSON.stringify(envelope)).not.toContain(TOKEN)
  })

  test('opens with the AAD of the row and with no other: another id, another version, a suffix', async () => {
    const provider = realProvider()
    const service = createHolidayProviderTokenSecretService({ envelopeProvider: provider })
    const envelope = await service.encrypt({ settingsId: SETTINGS_ID, token: TOKEN })

    const sealedElsewhere = await Promise.all(
      [
        `transportada:holiday-provider-token:v2:${SETTINGS_ID}`,
        `${CANONICAL_AAD}:feriadosapi`,
        'transportada:holiday-provider-token:v1:',
        `transportada:contractor-mail-credential:v1:${SETTINGS_ID}`,
      ].map((aad) =>
        provider.encrypt({
          additionalAuthenticatedData: TEXT_ENCODER.encode(aad),
          plaintext: TEXT_ENCODER.encode(JSON.stringify({ token: TOKEN })),
        }),
      ),
    )

    const failures = await Promise.all([
      captureError(() => service.decrypt({ envelope, settingsId: OTHER_SETTINGS_ID })),
      ...sealedElsewhere.map((other) =>
        captureError(() => service.decrypt({ envelope: other, settingsId: SETTINGS_ID })),
      ),
      captureError(() =>
        service.decrypt({
          envelope: { ...envelope, ciphertext: flipFirstCharacter(envelope.ciphertext) },
          settingsId: SETTINGS_ID,
        }),
      ),
    ])

    for (const error of failures) expectSafeUnavailable(error)
  })

  test('rejects a plaintext with a field outside the allowlist and clears the provider-owned bytes', async () => {
    let plaintextReference: Uint8Array | undefined
    const service = createHolidayProviderTokenSecretService({
      envelopeProvider: providerReturning(() => {
        plaintextReference = TEXT_ENCODER.encode(
          JSON.stringify({ extra: 'smuggled', token: TOKEN }),
        )
        return plaintextReference
      }),
    })

    const error = await captureError(() =>
      service.decrypt({ envelope: syntheticEnvelope(), settingsId: SETTINGS_ID }),
    )

    expectSafeUnavailable(error)
    expect(plaintextReference && [...plaintextReference]).toEqual(zeros(plaintextReference))
  })

  test('rejects a decrypted token outside the visible-ASCII 16..512 rule, and a plaintext that is not JSON', async () => {
    const outsideTheRule = [
      'short-token-1ch',
      'x'.repeat(513),
      'has a space inside 123456',
      'acentuação-na-chave-12345',
      'control\u0007char-in-key-123',
    ]
    const plaintexts = [
      ...outsideTheRule.map((token) => JSON.stringify({ token })),
      'not json at all',
      JSON.stringify({ token: 1_234_567_890_123_456 }),
      JSON.stringify([TOKEN]),
    ]

    for (const plaintext of plaintexts) {
      const service = createHolidayProviderTokenSecretService({
        envelopeProvider: providerReturning(() => TEXT_ENCODER.encode(plaintext)),
      })

      expectSafeUnavailable(
        await captureError(() =>
          service.decrypt({ envelope: syntheticEnvelope(), settingsId: SETTINGS_ID }),
        ),
      )
    }
  })

  test('accepts the boundaries of the rule: 16 and 512 visible ASCII characters', async () => {
    const service = createHolidayProviderTokenSecretService({ envelopeProvider: realProvider() })

    for (const token of ['a'.repeat(16), '~'.repeat(512), '!'.repeat(16)]) {
      const envelope = await service.encrypt({ settingsId: SETTINGS_ID, token })
      expect(await service.decrypt({ envelope, settingsId: SETTINGS_ID })).toBe(token)
    }
  })

  test('a malformed envelope becomes the same safe error, before the provider is touched', async () => {
    let decryptCalls = 0
    const service = createHolidayProviderTokenSecretService({
      envelopeProvider: {
        async decrypt() {
          decryptCalls += 1
          return TEXT_ENCODER.encode(JSON.stringify({ token: TOKEN }))
        },
        async encrypt() {
          throw new Error('encrypt should not run')
        },
      },
    })

    for (const malformed of [
      { ...syntheticEnvelope(), keyRing: 'smuggled' },
      { algorithm: 'A256GCM' },
      'not-an-object',
      null,
      { ...syntheticEnvelope(), version: 2 },
    ]) {
      expectSafeUnavailable(
        await captureError(() => service.decrypt({ envelope: malformed, settingsId: SETTINGS_ID })),
      )
    }
    expect(decryptCalls).toBe(0)
  })

  test('refuses to seal a token outside the rule without touching the provider and without echoing it', async () => {
    let encryptCalls = 0
    const service = createHolidayProviderTokenSecretService({
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

    for (const token of ['curta-demais', 'x'.repeat(513), 'chave com espaço no meio 12345']) {
      const error = await captureError(() => service.encrypt({ settingsId: SETTINGS_ID, token }))

      expect(error).toMatchObject({ code: 'HOLIDAY_PROVIDER_TOKEN_INVALID', status: 400 })
      expect(`${JSON.stringify(error)}${(error as Error).message}`).not.toContain(token)
    }
    expect(encryptCalls).toBe(0)
  })

  test('an envelope with fields outside the allowlist coming out of the provider is refused safely', async () => {
    const service = createHolidayProviderTokenSecretService({
      envelopeProvider: {
        async decrypt() {
          throw new Error('decrypt should not run')
        },
        async encrypt() {
          return { ...syntheticEnvelope(), keyRing: 'smuggled' } as unknown as SecretEnvelopeV1
        },
      },
    })

    expectSafeUnavailable(
      await captureError(() => service.encrypt({ settingsId: SETTINGS_ID, token: TOKEN })),
    )
  })

  test('a provider failure carries nothing of the provider into the error', async () => {
    const service = createHolidayProviderTokenSecretService({
      envelopeProvider: {
        async decrypt() {
          throw new Error(`vault says no for ${TOKEN} and ${SETTINGS_ID}`)
        },
        async encrypt() {
          throw new Error(`vault says no for ${TOKEN} and ${SETTINGS_ID}`)
        },
      },
    })

    expectSafeUnavailable(
      await captureError(() => service.encrypt({ settingsId: SETTINGS_ID, token: TOKEN })),
    )
    expectSafeUnavailable(
      await captureError(() =>
        service.decrypt({ envelope: syntheticEnvelope(), settingsId: SETTINGS_ID }),
      ),
    )
  })
})

function providerReturning(plaintext: () => Uint8Array): SecretEnvelopeProvider {
  return {
    async decrypt() {
      return plaintext()
    },
    async encrypt() {
      throw new Error('encrypt should not run')
    },
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
    code: 'HOLIDAY_PROVIDER_TOKEN_UNAVAILABLE',
    message: 'Holiday provider token is unavailable',
    status: 500,
  })
  expect(error).not.toHaveProperty('cause')
  const serialized = `${JSON.stringify(error)}${(error as Error).stack ?? ''}`
  for (const sensitive of [TOKEN, SETTINGS_ID, OTHER_SETTINGS_ID]) {
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
