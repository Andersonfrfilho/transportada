/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { InvitationCodeEnvelopeProviderPort } from './invitation-code.service.js'

const TEXT_ENCODER = new TextEncoder()

export type InvitationCodeScope = {
  readonly companyId: string
  readonly userId: string
}

/**
 * O AAD amarra o envelope à empresa e ao usuário: envelope de um convite não abre no contexto de
 * outro, mesmo com a chave certa. O worker reconstrói o mesmo dado a partir da linha do convite.
 */
export function createInvitationCodeSecretService(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}): InvitationCodeEnvelopeProviderPort {
  return {
    async encrypt(request): Promise<SecretEnvelopeV1> {
      const additionalAuthenticatedData = buildInvitationCodeAad(request)
      const plaintext = TEXT_ENCODER.encode(request.plaintext)
      try {
        return await input.envelopeProvider.encrypt({ additionalAuthenticatedData, plaintext })
      } finally {
        plaintext.fill(0)
        additionalAuthenticatedData.fill(0)
      }
    },
  }
}

export function buildInvitationCodeAad(scope: InvitationCodeScope): Uint8Array {
  return TEXT_ENCODER.encode(`transportada:invitation-code:v1:${scope.companyId}:${scope.userId}`)
}
