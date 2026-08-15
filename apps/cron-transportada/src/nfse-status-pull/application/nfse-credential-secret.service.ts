/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia por valor do serviço do worker (`nfse-issuance/application/nfse-credential-secret.service.ts`)
 * — as apps não importam código uma da outra. O AAD tem de ser **idêntico** ao usado ao selar, ou a
 * abertura falha: `transportada:nfse-credential:v1:${companyId}:${credentialId}`.
 *
 * Só o `apiToken` sai daqui. O `callbackToken` existe no envelope selado, mas quem o compara é a
 * rota pública na API; trazê-lo para o cron seria segredo circulando sem consumidor.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { z } from 'zod'

const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true })
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

const secretSchema = z
  .object({
    apiToken: z.string().min(1),
    callbackToken: z.string().min(1),
  })
  .strict()

export type NfseCredentialSecretService = {
  readonly decrypt: (params: {
    readonly companyId: string
    readonly credentialId: string
    readonly envelope: unknown
  }) => Promise<{ readonly apiToken: string }>
}

export function createNfseCredentialSecretService(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}): NfseCredentialSecretService {
  return {
    decrypt: async (params) => {
      const envelope = envelopeSchema.parse(params.envelope) as SecretEnvelopeV1
      const additionalAuthenticatedData = TEXT_ENCODER.encode(
        `transportada:nfse-credential:v1:${params.companyId}:${params.credentialId}`,
      )
      let plaintext: Uint8Array | undefined
      try {
        plaintext = await input.envelopeProvider.decrypt({ additionalAuthenticatedData, envelope })
        const parsed = secretSchema.parse(JSON.parse(TEXT_DECODER.decode(plaintext)) as unknown)
        return { apiToken: parsed.apiToken }
      } finally {
        plaintext?.fill(0)
        additionalAuthenticatedData.fill(0)
      }
    },
  }
}
