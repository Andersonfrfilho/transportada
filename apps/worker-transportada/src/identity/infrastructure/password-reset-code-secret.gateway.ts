/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

const TEXT_DECODER = new TextDecoder()
const TEXT_ENCODER = new TextEncoder()

/**
 * ⚠️ O AAD é palavra por palavra o da API
 * (`identity/application/password-reset-code.service.ts`). Divergiu de um lado, o envelope não abre
 * do outro — e as duas apps não importam código uma da outra.
 *
 * Amarra ao **pedido**, e não ao usuário como no convite: a mesma pessoa abre vários pedidos, e o
 * envelope de um não pode abrir no contexto de outro.
 */
export function buildPasswordResetCodeAad(scope: {
  readonly companyId: string
  readonly requestId: string
}): Uint8Array {
  return TEXT_ENCODER.encode(`transportada:password-reset:v1:${scope.companyId}:${scope.requestId}`)
}

export function createPasswordResetCodeSecretGateway(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}) {
  return {
    async decrypt(request: {
      readonly companyId: string
      readonly envelope: unknown
      readonly requestId: string
    }): Promise<string> {
      const additionalAuthenticatedData = buildPasswordResetCodeAad(request)

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
