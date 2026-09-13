/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { createSecretEnvelopeProvider, type SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import { createContractorMailCredentialSecretService } from '../../src/contractor-mail/application/contractor-mail-credential-secret.service.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000d1'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-0000000000d2'
const SETTINGS_ID = '00000000-0000-4000-8000-0000000000d3'
const OTHER_SETTINGS_ID = '00000000-0000-4000-8000-0000000000d4'
const API_KEY = 're_synthetic_resend_api_key'
const WEBHOOK_SIGNING_SECRET = 'whsec_synthetic_svix_secret'

const TEXT_ENCODER = new TextEncoder()

describe('the worker opens the contractor mail credential sealed by the API (spec 143 T006)', () => {
  test('opens an envelope built exactly like the API would build it', async () => {
    const service = createContractorMailCredentialSecretService({
      envelopeProvider: realProvider(),
    })
    const envelope = await encryptLikeTheApiWould({
      companyId: COMPANY_ID,
      secret: { apiKey: API_KEY, webhookSigningSecret: WEBHOOK_SIGNING_SECRET },
      settingsId: SETTINGS_ID,
    })

    const secret = await service.decrypt({
      companyId: COMPANY_ID,
      envelope,
      settingsId: SETTINGS_ID,
    })

    expect(secret).toEqual({ apiKey: API_KEY, webhookSigningSecret: WEBHOOK_SIGNING_SECRET })
  })

  test('fails closed on a cross-tenant AAD and on a different settingsId', async () => {
    const service = createContractorMailCredentialSecretService({
      envelopeProvider: realProvider(),
    })
    const envelope = await encryptLikeTheApiWould({
      companyId: COMPANY_ID,
      secret: { apiKey: API_KEY, webhookSigningSecret: WEBHOOK_SIGNING_SECRET },
      settingsId: SETTINGS_ID,
    })

    await expect(
      service.decrypt({ companyId: OTHER_COMPANY_ID, envelope, settingsId: SETTINGS_ID }),
    ).rejects.toThrow()
    await expect(
      service.decrypt({ companyId: COMPANY_ID, envelope, settingsId: OTHER_SETTINGS_ID }),
    ).rejects.toThrow()
  })

  test('fails closed on a tampered ciphertext', async () => {
    const service = createContractorMailCredentialSecretService({
      envelopeProvider: realProvider(),
    })
    const envelope = await encryptLikeTheApiWould({
      companyId: COMPANY_ID,
      secret: { apiKey: API_KEY, webhookSigningSecret: WEBHOOK_SIGNING_SECRET },
      settingsId: SETTINGS_ID,
    })

    await expect(
      service.decrypt({
        companyId: COMPANY_ID,
        envelope: { ...envelope, ciphertext: flipFirstCharacter(envelope.ciphertext) },
        settingsId: SETTINGS_ID,
      }),
    ).rejects.toThrow()
  })

  test('never leaks the secret value in the thrown error', async () => {
    const service = createContractorMailCredentialSecretService({
      envelopeProvider: realProvider(),
    })
    const envelope = await encryptLikeTheApiWould({
      companyId: COMPANY_ID,
      secret: { apiKey: API_KEY, webhookSigningSecret: WEBHOOK_SIGNING_SECRET },
      settingsId: SETTINGS_ID,
    })

    let caught: unknown
    try {
      await service.decrypt({ companyId: OTHER_COMPANY_ID, envelope, settingsId: SETTINGS_ID })
    } catch (error: unknown) {
      caught = error
    }

    const serialized = `${JSON.stringify(caught)}${(caught as Error | undefined)?.stack ?? ''}`
    for (const sensitive of [API_KEY, WEBHOOK_SIGNING_SECRET]) {
      expect(serialized).not.toContain(sensitive)
    }
  })
})

function realProvider() {
  return createSecretEnvelopeProvider({
    activeKeyId: 'test-v1',
    keys: { 'test-v1': Uint8Array.from({ length: 32 }, (_value, index) => index + 1) },
  })
}

/**
 * Recria exatamente o que a API produziria ao selar — mesmo AAD, mesmo JSON estrito —, sem importar
 * o código-fonte dela: as duas apps não importam código uma da outra (`AGENTS.md`). É isso que prova
 * a paridade de verdade: um envelope "vindo da API" abre aqui.
 */
async function encryptLikeTheApiWould(input: {
  readonly companyId: string
  readonly secret: { readonly apiKey: string; readonly webhookSigningSecret: string }
  readonly settingsId: string
}): Promise<SecretEnvelopeV1> {
  const provider = realProvider()
  const additionalAuthenticatedData = TEXT_ENCODER.encode(
    `transportada:contractor-mail-credential:v1:${input.companyId}:${input.settingsId}`,
  )
  const plaintext = TEXT_ENCODER.encode(JSON.stringify(input.secret))
  return provider.encrypt({ additionalAuthenticatedData, plaintext })
}

function flipFirstCharacter(value: string): string {
  const first = value.slice(0, 1)
  return `${first === 'A' ? 'B' : 'A'}${value.slice(1)}`
}
