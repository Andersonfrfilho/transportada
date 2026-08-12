/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { z } from 'zod'

import { NfseProviderCredentialUnavailableError } from '../domain/nfse-profile.error.js'

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

const secretSchema = z
  .object({
    apiToken: z.string().min(1),
    callbackToken: z.string().min(1),
  })
  .strict()

export type NfseCredentialSecret = {
  readonly apiToken: string
  readonly callbackToken: string
}

export type NfseCredentialScope = {
  readonly companyId: string
  readonly credentialId: string
}

export type NfseCredentialSecretService = {
  decrypt(
    input: NfseCredentialScope & { readonly envelope: SecretEnvelopeV1 },
  ): Promise<NfseCredentialSecret>
  encrypt(input: NfseCredentialScope & NfseCredentialSecret): Promise<SecretEnvelopeV1>
}

export function createNfseCredentialSecretService(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}): NfseCredentialSecretService {
  return {
    decrypt: (request) => decryptSecret({ input: request, provider: input.envelopeProvider }),
    encrypt: (request) => encryptSecret({ input: request, provider: input.envelopeProvider }),
  }
}

async function encryptSecret(params: {
  readonly input: NfseCredentialScope & NfseCredentialSecret
  readonly provider: SecretEnvelopeProvider
}): Promise<SecretEnvelopeV1> {
  const { input, provider } = params
  let plaintext: Uint8Array | undefined
  const additionalAuthenticatedData = createAdditionalAuthenticatedData(input)
  try {
    plaintext = encodeSecret(input)
    const envelope = await provider.encrypt({ additionalAuthenticatedData, plaintext })
    return envelopeSchema.parse(envelope)
  } catch {
    throw new NfseProviderCredentialUnavailableError()
  } finally {
    plaintext?.fill(0)
    additionalAuthenticatedData.fill(0)
  }
}

async function decryptSecret(params: {
  readonly input: NfseCredentialScope & { readonly envelope: SecretEnvelopeV1 }
  readonly provider: SecretEnvelopeProvider
}): Promise<NfseCredentialSecret> {
  const { input, provider } = params
  const additionalAuthenticatedData = createAdditionalAuthenticatedData(input)
  let plaintext: Uint8Array | undefined
  try {
    plaintext = await provider.decrypt({ additionalAuthenticatedData, envelope: input.envelope })
    return parseSecret(plaintext)
  } catch {
    throw new NfseProviderCredentialUnavailableError()
  } finally {
    plaintext?.fill(0)
    additionalAuthenticatedData.fill(0)
  }
}

function createAdditionalAuthenticatedData(input: NfseCredentialScope): Uint8Array {
  return TEXT_ENCODER.encode(
    `transportada:nfse-credential:v1:${input.companyId}:${input.credentialId}`,
  )
}

function encodeSecret(input: NfseCredentialSecret): Uint8Array {
  return TEXT_ENCODER.encode(
    JSON.stringify({ apiToken: input.apiToken, callbackToken: input.callbackToken }),
  )
}

function parseSecret(plaintext: Uint8Array): NfseCredentialSecret {
  const parsed = secretSchema.parse(JSON.parse(TEXT_DECODER.decode(plaintext)) as unknown)
  return { apiToken: parsed.apiToken, callbackToken: parsed.callbackToken }
}
