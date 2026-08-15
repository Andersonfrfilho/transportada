/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import { generateInvitationCode, hashInvitationCode } from '../domain/invitation.policy.js'

export type InvitationCodeEnvelopeProviderPort = {
  readonly encrypt: (input: {
    readonly companyId: string
    readonly plaintext: string
    readonly userId: string
  }) => Promise<SecretEnvelopeV1>
}

export type IssuedInvitationCode = {
  readonly codeHash: string
  readonly sealedCode: SecretEnvelopeV1
}

/**
 * Único lugar onde o código em claro existe do lado da API — e ele não sai daqui: sai o hash, que
 * valida a tentativa, e o envelope, que o worker abre para entregar. Convite e reenvio passam pelos
 * dois pelo mesmo caminho para nunca produzirem um sem o outro, que é como o código acabava
 * descartado antes da feature 026 fase D.
 */
export async function issueInvitationCode({
  companyId,
  envelopeProvider,
  userId,
}: {
  readonly companyId: string
  readonly envelopeProvider: InvitationCodeEnvelopeProviderPort
  readonly userId: string
}): Promise<IssuedInvitationCode> {
  const code = generateInvitationCode()

  return {
    codeHash: hashInvitationCode(code),
    sealedCode: await envelopeProvider.encrypt({ companyId, plaintext: code, userId }),
  }
}
