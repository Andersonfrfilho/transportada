/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { z } from 'zod'

import { WhatsAppEvolutionUnavailableError } from '../domain/whatsapp-evolution.error.js'

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

const secretSchema = z.object({ apiKey: z.string().min(1) }).strict()

export type WhatsAppEvolutionSecret = { readonly apiKey: string }

export type WhatsAppEvolutionScope = {
  readonly companyId: string
  readonly settingsId: string
}

export type WhatsAppEvolutionSecretService = {
  decrypt(
    input: WhatsAppEvolutionScope & { readonly envelope: SecretEnvelopeV1 },
  ): Promise<WhatsAppEvolutionSecret>
  encrypt(input: WhatsAppEvolutionScope & WhatsAppEvolutionSecret): Promise<SecretEnvelopeV1>
}

/**
 * Spec 281 T4: a chave da instância do Evolution selada por empresa, no desenho do canal da Meta.
 * O AAD amarra o envelope à linha: `transportada:whatsapp-evolution:v1:${companyId}:${settingsId}`.
 */
export function createWhatsAppEvolutionSecretService(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}): WhatsAppEvolutionSecretService {
  return {
    async decrypt(request) {
      const aad = createAad(request)
      let plaintext: Uint8Array | undefined
      try {
        plaintext = await input.envelopeProvider.decrypt({
          additionalAuthenticatedData: aad,
          envelope: request.envelope,
        })
        return secretSchema.parse(JSON.parse(TEXT_DECODER.decode(plaintext)))
      } catch {
        throw new WhatsAppEvolutionUnavailableError()
      } finally {
        plaintext?.fill(0)
        aad.fill(0)
      }
    },
    async encrypt(request) {
      const aad = createAad(request)
      let plaintext: Uint8Array | undefined
      try {
        plaintext = TEXT_ENCODER.encode(JSON.stringify({ apiKey: request.apiKey }))
        const envelope = await input.envelopeProvider.encrypt({
          additionalAuthenticatedData: aad,
          plaintext,
        })
        return envelopeSchema.parse(envelope)
      } catch {
        throw new WhatsAppEvolutionUnavailableError()
      } finally {
        plaintext?.fill(0)
        aad.fill(0)
      }
    },
  }
}

function createAad(input: WhatsAppEvolutionScope): Uint8Array {
  return TEXT_ENCODER.encode(
    `transportada:whatsapp-evolution:v1:${input.companyId}:${input.settingsId}`,
  )
}
