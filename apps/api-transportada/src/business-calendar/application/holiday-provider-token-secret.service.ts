/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { z } from 'zod'

import {
  HOLIDAY_PROVIDER_TOKEN_AAD_PREFIX,
  HOLIDAY_PROVIDER_TOKEN_PATTERN,
} from '../domain/holiday-provider-settings.constant.js'
import {
  HolidayProviderTokenFormatError,
  HolidayProviderTokenUnavailableError,
} from '../domain/holiday-provider-settings.error.js'

const TEXT_DECODER = new TextDecoder()
const TEXT_ENCODER = new TextEncoder()

const envelopeSchema = z
  .object({
    algorithm: z.literal('A256GCM'),
    ciphertext: z.string().min(1),
    keyId: z.string().min(1),
    nonce: z.string().min(1),
    version: z.literal(1),
  })
  .strict()

const secretSchema = z.object({ token: z.string().regex(HOLIDAY_PROVIDER_TOKEN_PATTERN) }).strict()

export type HolidayProviderTokenScope = { readonly settingsId: string }

export type HolidayProviderTokenSecretService = {
  decrypt(input: HolidayProviderTokenScope & { readonly envelope: unknown }): Promise<string>
  encrypt(input: HolidayProviderTokenScope & { readonly token: string }): Promise<SecretEnvelopeV1>
}

/**
 * Spec 262 (ADR-0102 D5): a chave da FeriadosAPI selada no mesmo desenho da credencial da Nota RP e do Resend.
 * O AAD amarra o envelope à **linha**: `transportada:holiday-provider-token:v1:${settingsId}`. Envelope copiado para
 * outra instalação (chaveiro e id diferentes) não abre. O plaintext é UTF-8 de `{"token":"…"}`, `.strict()`.
 *
 * O worker abre este envelope com uma cópia por valor deste serviço (só `decrypt`).
 */
export function createHolidayProviderTokenSecretService(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}): HolidayProviderTokenSecretService {
  return {
    decrypt: (request) => decryptToken({ input: request, provider: input.envelopeProvider }),
    encrypt: (request) => encryptToken({ input: request, provider: input.envelopeProvider }),
  }
}

async function encryptToken(params: {
  readonly input: HolidayProviderTokenScope & { readonly token: string }
  readonly provider: SecretEnvelopeProvider
}): Promise<SecretEnvelopeV1> {
  const { input, provider } = params
  // Antes de qualquer criptografia: chave fora da regra é erro do chamador, não falha do cofre.
  if (!HOLIDAY_PROVIDER_TOKEN_PATTERN.test(input.token)) throw new HolidayProviderTokenFormatError()

  const additionalAuthenticatedData = createAdditionalAuthenticatedData(input)
  let plaintext: Uint8Array | undefined
  try {
    plaintext = TEXT_ENCODER.encode(JSON.stringify({ token: input.token }))
    const envelope = await provider.encrypt({ additionalAuthenticatedData, plaintext })
    return envelopeSchema.parse(envelope)
  } catch {
    throw new HolidayProviderTokenUnavailableError()
  } finally {
    plaintext?.fill(0)
    additionalAuthenticatedData.fill(0)
  }
}

async function decryptToken(params: {
  readonly input: HolidayProviderTokenScope & { readonly envelope: unknown }
  readonly provider: SecretEnvelopeProvider
}): Promise<string> {
  const { input, provider } = params
  const additionalAuthenticatedData = createAdditionalAuthenticatedData(input)
  let plaintext: Uint8Array | undefined
  try {
    const envelope = envelopeSchema.parse(input.envelope)
    plaintext = await provider.decrypt({ additionalAuthenticatedData, envelope })
    return secretSchema.parse(JSON.parse(TEXT_DECODER.decode(plaintext)) as unknown).token
  } catch {
    throw new HolidayProviderTokenUnavailableError()
  } finally {
    plaintext?.fill(0)
    additionalAuthenticatedData.fill(0)
  }
}

function createAdditionalAuthenticatedData(input: HolidayProviderTokenScope): Uint8Array {
  return TEXT_ENCODER.encode(`${HOLIDAY_PROVIDER_TOKEN_AAD_PREFIX}${input.settingsId}`)
}
