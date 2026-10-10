/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider } from '@adatechnology/secret-envelope'
import { z } from 'zod'

import {
  HOLIDAY_PROVIDER_TOKEN_AAD_PREFIX,
  HOLIDAY_PROVIDER_TOKEN_PATTERN,
} from '../domain/holiday-provider-token.constant.js'
import { HolidayProviderTokenUnreadableError } from '../domain/holiday-provider-token.error.js'

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
}

/**
 * Spec 262 (ADR-0102 D5): cópia por valor de `holiday-provider-token-secret.service.ts` da API, só `decrypt` — quem
 * sela é a rota de configuração. O AAD amarra o envelope à **linha**; o plaintext é UTF-8 de `{"token":"…"}`,
 * `.strict()`. Qualquer falha, **inclusive o parse Zod do envelope**, vira `HolidayProviderTokenUnreadableError`:
 * o parse fica dentro do `try`, ao contrário do molde da credencial de e-mail.
 */
export function createHolidayProviderTokenSecretService(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}): HolidayProviderTokenSecretService {
  return {
    decrypt: (request) => decryptToken({ input: request, provider: input.envelopeProvider }),
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
    throw new HolidayProviderTokenUnreadableError()
  } finally {
    plaintext?.fill(0)
    additionalAuthenticatedData.fill(0)
  }
}

function createAdditionalAuthenticatedData(input: HolidayProviderTokenScope): Uint8Array {
  return TEXT_ENCODER.encode(`${HOLIDAY_PROVIDER_TOKEN_AAD_PREFIX}${input.settingsId}`)
}
