/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { z } from 'zod'

import { WhatsAppEvolutionUnavailableError } from '../domain/whatsapp-evolution.error.js'
import type { WhatsAppEvolutionScope } from './whatsapp-evolution-secret.service.js'

const TEXT_DECODER = new TextDecoder()
const TEXT_ENCODER = new TextEncoder()
/** 32 bytes aleatórios: o segredo não é digitado por ninguém, só vai e volta entre a API e o Evolution. */
const WEBHOOK_TOKEN_BYTES = 32

const envelopeSchema = z
  .object({
    algorithm: z.literal('A256GCM'),
    ciphertext: z.string().min(1),
    keyId: z.string().min(1),
    nonce: z.string().min(1),
    version: z.literal(1),
  })
  .strict()

const secretSchema = z.object({ webhookToken: z.string().min(1) }).strict()

export type WhatsAppEvolutionWebhookSecretService = {
  decrypt(
    input: WhatsAppEvolutionScope & { readonly envelope: SecretEnvelopeV1 },
  ): Promise<{ readonly webhookToken: string }>
  encrypt(
    input: WhatsAppEvolutionScope & { readonly webhookToken: string },
  ): Promise<SecretEnvelopeV1>
  generate(): string
}

/**
 * Spec 281 T6 (RF4): o segredo que o Evolution repete no cabeçalho de cada entrega. Selado como a
 * chave da instância, mas com AAD **próprio** (`transportada:whatsapp-evolution-webhook:v1:…`):
 * trocar um envelope pelo outro na linha não abre nenhum dos dois.
 */
export function createWhatsAppEvolutionWebhookSecretService(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
  readonly randomBytes?: (length: number) => Uint8Array
}): WhatsAppEvolutionWebhookSecretService {
  const randomBytes =
    input.randomBytes ?? ((length: number) => crypto.getRandomValues(new Uint8Array(length)))

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
        plaintext = TEXT_ENCODER.encode(JSON.stringify({ webhookToken: request.webhookToken }))
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
    generate() {
      return Buffer.from(randomBytes(WEBHOOK_TOKEN_BYTES)).toString('base64url')
    },
  }
}

function createAad(input: WhatsAppEvolutionScope): Uint8Array {
  return TEXT_ENCODER.encode(
    `transportada:whatsapp-evolution-webhook:v1:${input.companyId}:${input.settingsId}`,
  )
}
