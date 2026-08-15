/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

const TEXT_DECODER = new TextDecoder()
const TEXT_ENCODER = new TextEncoder()

/**
 * ⚠️ O AAD é palavra por palavra o da API (`identity/application/invitation-code-secret.service.ts`).
 * Divergiu de um lado, o envelope não abre do outro — e as duas apps não importam código uma da
 * outra.
 */
export function createInvitationCodeSecretGateway(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}) {
  return {
    async decrypt(request: {
      readonly companyId: string
      readonly envelope: unknown
      readonly userId: string
    }): Promise<string> {
      const additionalAuthenticatedData = TEXT_ENCODER.encode(
        `transportada:invitation-code:v1:${request.companyId}:${request.userId}`,
      )

      try {
        const plaintext = await input.envelopeProvider.decrypt({
          additionalAuthenticatedData,
          envelope: request.envelope as SecretEnvelopeV1,
        })

        return TEXT_DECODER.decode(plaintext)
      } finally {
        additionalAuthenticatedData.fill(0)
      }
    },
  }
}
