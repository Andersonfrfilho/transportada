/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0057 §3: o documento do recebedor persiste em envelope A256GCM, com AAD amarrado à empresa e
 * ao próprio comprovante — mover a linha de lugar invalida a abertura, que é o freio desejado.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { z } from 'zod'

import { TripDeliveryProofDocumentUnavailableError } from '../domain/trip.error.js'

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

export type DeliveryProofDocumentScope = {
  readonly companyId: string
  readonly proofId: string
}

export type DeliveryProofDocumentSecretService = {
  encrypt(
    input: DeliveryProofDocumentScope & { readonly receiverDocument: string },
  ): Promise<SecretEnvelopeV1>
}

export function createDeliveryProofDocumentSecretService(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}): DeliveryProofDocumentSecretService {
  return {
    encrypt: async (request) => {
      let plaintext: Uint8Array | undefined
      const additionalAuthenticatedData = TEXT_ENCODER.encode(
        `transportada:delivery-proof:v1:${request.companyId}:${request.proofId}`,
      )
      try {
        plaintext = TEXT_ENCODER.encode(request.receiverDocument)
        const envelope = await input.envelopeProvider.encrypt({
          additionalAuthenticatedData,
          plaintext,
        })
        return envelopeSchema.parse(envelope)
      } catch {
        throw new TripDeliveryProofDocumentUnavailableError()
      } finally {
        plaintext?.fill(0)
        additionalAuthenticatedData.fill(0)
      }
    },
  }
}
