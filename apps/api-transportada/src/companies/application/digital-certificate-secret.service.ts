/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { z } from 'zod'

import { DigitalCertificateUnavailableError } from '../domain/digital-certificate.error.js'
import type {
  DigitalCertificateSecret,
  DigitalCertificateSecretService,
} from './digital-certificate.port.js'

const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true })
const TEXT_ENCODER = new TextEncoder()
const MAX_CERTIFICATE_BYTES = 1_048_576
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
    certificateBase64: z.string().refine(isCanonicalCertificateBase64),
    password: z.string().refine(isValidPassword),
  })
  .strict()

type SecretScope = {
  readonly certificateId: string
  readonly companyId: string
  readonly purpose: 'cte'
}

export function createDigitalCertificateSecretService(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}): DigitalCertificateSecretService {
  return {
    decrypt: (request) => decryptSecret({ input: request, provider: input.envelopeProvider }),
    encrypt: (request) => encryptSecret({ input: request, provider: input.envelopeProvider }),
  }
}

async function encryptSecret(params: {
  readonly input: SecretScope & DigitalCertificateSecret
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
    throw new DigitalCertificateUnavailableError()
  } finally {
    plaintext?.fill(0)
    additionalAuthenticatedData.fill(0)
  }
}

async function decryptSecret(params: {
  readonly input: SecretScope & { readonly envelope: SecretEnvelopeV1 }
  readonly provider: SecretEnvelopeProvider
}): Promise<DigitalCertificateSecret> {
  const { input, provider } = params
  const additionalAuthenticatedData = createAdditionalAuthenticatedData(input)
  let plaintext: Uint8Array | undefined
  try {
    plaintext = await provider.decrypt({
      additionalAuthenticatedData,
      envelope: input.envelope,
    })
    return parseSecret(plaintext)
  } catch {
    throw new DigitalCertificateUnavailableError()
  } finally {
    plaintext?.fill(0)
    additionalAuthenticatedData.fill(0)
  }
}

function createAdditionalAuthenticatedData(input: SecretScope): Uint8Array {
  return TEXT_ENCODER.encode(
    `transportada:certificate:v1:${input.companyId}:${input.certificateId}:${input.purpose}`,
  )
}

function parseSecret(plaintext: Uint8Array): DigitalCertificateSecret {
  const parsed = secretSchema.parse(JSON.parse(TEXT_DECODER.decode(plaintext)) as unknown)
  return {
    certificateBase64: parsed.certificateBase64,
    password: parsed.password,
  }
}

function encodeSecret(secret: DigitalCertificateSecret): Uint8Array {
  const parsed = secretSchema.parse({
    certificateBase64: secret.certificateBase64,
    password: secret.password,
  })
  return TEXT_ENCODER.encode(
    JSON.stringify({
      certificateBase64: parsed.certificateBase64,
      password: parsed.password,
    }),
  )
}

function isCanonicalCertificateBase64(value: string): boolean {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return false
  }
  const bytes = Buffer.from(value, 'base64')
  return (
    bytes.byteLength > 0 &&
    bytes.byteLength <= MAX_CERTIFICATE_BYTES &&
    bytes.toString('base64') === value
  )
}

function isValidPassword(value: string): boolean {
  const byteLength = TEXT_ENCODER.encode(value).byteLength
  return byteLength >= 1 && byteLength <= 256
}
