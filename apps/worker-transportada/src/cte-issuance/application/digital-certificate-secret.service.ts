/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { z } from 'zod'

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

export type DigitalCertificateSecret = {
  readonly certificateBase64: string
  readonly password: string
}

export function createDigitalCertificateSecretService(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}): {
  readonly decrypt: (params: {
    readonly certificateId: string
    readonly companyId: string
    readonly envelope: unknown
    readonly purpose: 'cte' | 'mdfe'
  }) => Promise<DigitalCertificateSecret>
} {
  return {
    decrypt: async (params) => {
      const envelope = envelopeSchema.parse(params.envelope) as SecretEnvelopeV1
      const additionalAuthenticatedData = TEXT_ENCODER.encode(
        `transportada:certificate:v1:${params.companyId}:${params.certificateId}:${params.purpose}`,
      )
      let plaintext: Uint8Array | undefined
      try {
        plaintext = await input.envelopeProvider.decrypt({
          additionalAuthenticatedData,
          envelope,
        })
        const parsed = secretSchema.parse(JSON.parse(TEXT_DECODER.decode(plaintext)) as unknown)
        return {
          certificateBase64: parsed.certificateBase64,
          password: parsed.password,
        }
      } finally {
        plaintext?.fill(0)
        additionalAuthenticatedData.fill(0)
      }
    },
  }
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
