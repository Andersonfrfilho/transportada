/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { z } from 'zod'

import { WhatsAppChannelUnavailableError } from '../domain/whatsapp-channel.error.js'

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

const secretSchema = z.object({ accessToken: z.string().min(1) }).strict()

export type WhatsAppChannelSecret = { readonly accessToken: string }

export type WhatsAppChannelScope = {
  readonly channelId: string
  readonly companyId: string
}

export type WhatsAppChannelSecretService = {
  decrypt(
    input: WhatsAppChannelScope & { readonly envelope: SecretEnvelopeV1 },
  ): Promise<WhatsAppChannelSecret>
  encrypt(input: WhatsAppChannelScope & WhatsAppChannelSecret): Promise<SecretEnvelopeV1>
}

/**
 * Spec 062 T001: o token de acesso da Meta selado, com o mesmo desenho da credencial da Nota RP.
 *
 * O AAD amarra o envelope à **linha**: `transportada:whatsapp-channel:v1:${companyId}:${channelId}`.
 * Envelope copiado para outra empresa — ou para outro canal da mesma — não abre, mesmo com a chave
 * certa e o banco inteiro na mão. É a diferença entre "cifrado" e "cifrado para este uso".
 */
export function createWhatsAppChannelSecretService(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}): WhatsAppChannelSecretService {
  return {
    decrypt: (request) => decryptSecret({ input: request, provider: input.envelopeProvider }),
    encrypt: (request) => encryptSecret({ input: request, provider: input.envelopeProvider }),
  }
}

async function encryptSecret(params: {
  readonly input: WhatsAppChannelScope & WhatsAppChannelSecret
  readonly provider: SecretEnvelopeProvider
}): Promise<SecretEnvelopeV1> {
  const { input, provider } = params
  const additionalAuthenticatedData = createAdditionalAuthenticatedData(input)
  let plaintext: Uint8Array | undefined
  try {
    plaintext = TEXT_ENCODER.encode(JSON.stringify({ accessToken: input.accessToken }))
    const envelope = await provider.encrypt({ additionalAuthenticatedData, plaintext })

    return envelopeSchema.parse(envelope)
  } catch {
    /** O erro real vai para o log; a resposta não diz se foi a chave, o AAD ou o formato. */
    throw new WhatsAppChannelUnavailableError()
  } finally {
    /** O token some da memória assim que o envelope existe — o `finally` roda no erro também. */
    plaintext?.fill(0)
    additionalAuthenticatedData.fill(0)
  }
}

async function decryptSecret(params: {
  readonly input: WhatsAppChannelScope & { readonly envelope: SecretEnvelopeV1 }
  readonly provider: SecretEnvelopeProvider
}): Promise<WhatsAppChannelSecret> {
  const { input, provider } = params
  const additionalAuthenticatedData = createAdditionalAuthenticatedData(input)
  let plaintext: Uint8Array | undefined
  try {
    plaintext = await provider.decrypt({ additionalAuthenticatedData, envelope: input.envelope })

    return secretSchema.parse(JSON.parse(TEXT_DECODER.decode(plaintext)))
  } catch {
    throw new WhatsAppChannelUnavailableError()
  } finally {
    plaintext?.fill(0)
    additionalAuthenticatedData.fill(0)
  }
}

function createAdditionalAuthenticatedData(input: WhatsAppChannelScope): Uint8Array {
  return TEXT_ENCODER.encode(
    `transportada:whatsapp-channel:v1:${input.companyId}:${input.channelId}`,
  )
}
