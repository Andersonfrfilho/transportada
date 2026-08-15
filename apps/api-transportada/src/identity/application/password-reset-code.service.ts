/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import { generateInvitationCode, hashInvitationCode } from '../domain/invitation.policy.js'

const TEXT_ENCODER = new TextEncoder()

export type PasswordResetCodeScope = {
  readonly companyId: string
  readonly requestId: string
}

export type PasswordResetCodeEnvelopeProviderPort = {
  readonly encrypt: (
    input: PasswordResetCodeScope & { readonly plaintext: string },
  ) => Promise<SecretEnvelopeV1>
}

export type IssuedPasswordResetCode = {
  readonly codeHash: string
  readonly sealedCode: SecretEnvelopeV1
}

/**
 * Único lugar onde o código em claro existe do lado da API — e ele não sai daqui: sai o hash, que
 * valida a tentativa, e o envelope, que o worker abre para entregar.
 */
export async function issuePasswordResetCode({
  companyId,
  envelopeProvider,
  requestId,
}: PasswordResetCodeScope & {
  readonly envelopeProvider: PasswordResetCodeEnvelopeProviderPort
}): Promise<IssuedPasswordResetCode> {
  const code = generateInvitationCode()

  return {
    codeHash: hashInvitationCode(code),
    sealedCode: await envelopeProvider.encrypt({ companyId, plaintext: code, requestId }),
  }
}

/**
 * O AAD amarra o envelope à empresa e ao pedido: envelope de um pedido não abre no contexto de
 * outro, mesmo com a chave certa. O worker reconstrói o mesmo dado a partir da linha do pedido.
 */
export function createPasswordResetCodeSecretService(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}): PasswordResetCodeEnvelopeProviderPort {
  return {
    async encrypt(request): Promise<SecretEnvelopeV1> {
      const additionalAuthenticatedData = buildPasswordResetCodeAad(request)
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

export function buildPasswordResetCodeAad(scope: PasswordResetCodeScope): Uint8Array {
  return TEXT_ENCODER.encode(`transportada:password-reset:v1:${scope.companyId}:${scope.requestId}`)
}
