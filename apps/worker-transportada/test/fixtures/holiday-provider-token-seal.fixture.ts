/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T4.1: recria exatamente o que a API produz ao selar a chave da FeriadosAPI — mesmo AAD, mesmo JSON —
 * sem importar o código-fonte dela (as apps não importam código uma da outra). Quem cobra a igualdade com a API
 * é `token-secret-parity.contract.ts`. A chave é uma sentinela obviamente falsa: nunca um valor real.
 */
import {
  createSecretEnvelopeProvider,
  type SecretEnvelopeProvider,
  type SecretEnvelopeV1,
} from '@adatechnology/secret-envelope'

export const FIXTURE_HOLIDAY_TOKEN = 'FAKE-feriados-key-Q7zK-0123456789'

const TEXT_ENCODER = new TextEncoder()

/** Dois chaveiros diferentes: o da instalação e um de outra instalação (que não abre o envelope). */
export function buildEnvelopeProvider(input: {
  readonly keyId: string
  readonly keyFill: number
}): SecretEnvelopeProvider {
  return createSecretEnvelopeProvider({
    activeKeyId: input.keyId,
    keys: {
      [input.keyId]: Uint8Array.from({ length: 32 }, (_value, index) => index + input.keyFill),
    },
  })
}

export const INSTALLATION_PROVIDER = buildEnvelopeProvider({ keyFill: 1, keyId: 'test-v1' })
export const FOREIGN_PROVIDER = buildEnvelopeProvider({ keyFill: 7, keyId: 'foreign-v1' })

/** `plaintext` cru permite selar um corpo que a API nunca produziria (campo a mais, chave fora da regra). */
export async function sealLikeTheApiWould(input: {
  readonly plaintext?: string
  readonly provider?: SecretEnvelopeProvider
  readonly settingsId: string
  readonly token?: string
}): Promise<SecretEnvelopeV1> {
  const provider = input.provider ?? INSTALLATION_PROVIDER
  const body = input.plaintext ?? JSON.stringify({ token: input.token ?? FIXTURE_HOLIDAY_TOKEN })
  return provider.encrypt({
    additionalAuthenticatedData: TEXT_ENCODER.encode(
      `transportada:holiday-provider-token:v1:${input.settingsId}`,
    ),
    plaintext: TEXT_ENCODER.encode(body),
  })
}
