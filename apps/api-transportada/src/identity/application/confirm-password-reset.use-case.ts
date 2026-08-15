/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { hashInvitationCode } from '../domain/invitation.policy.js'
import {
  assertPasswordResetAccepted,
  decidePasswordReset,
  shouldRegisterFailedResetAttempt,
} from '../domain/password-reset.policy.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import { resolveIdentitySubject } from './company-user-identity.service.js'
import type { PasswordResetRepositoryPort } from './password-reset.port.js'

/**
 * Só `setPassword`. Não há `setEnabled` aqui nem por engano: recuperar senha é de quem já entrava,
 * e reabrir conta desabilitada com um código de e-mail seria escalada de privilégio. O tipo é o
 * que impede a chamada de aparecer numa edição futura.
 */
type ConfirmPasswordResetIdentityProviderPort = {
  setPassword(input: {
    readonly password: string
    readonly temporary: boolean
    readonly userId: string
  }): Promise<void>
}

type ConfirmPasswordResetDependencies = {
  /** O Admin API só conhece o `subject` do provedor; o `identity_users.id` não existe lá. */
  readonly identities: Pick<CompanyUserRepositoryPort, 'findIdentitySubject'>
  readonly identityProvider: ConfirmPasswordResetIdentityProviderPort
  readonly now: () => Date
  readonly requests: Pick<
    PasswordResetRepositoryPort,
    'findByCodeHash' | 'markConsumed' | 'registerFailedAttempt'
  >
}

export type ConfirmPasswordResetInput = {
  readonly code: string
  readonly password: string
}

export type ConfirmPasswordResetUseCase = {
  execute(input: ConfirmPasswordResetInput): Promise<void>
}

export function createConfirmPasswordResetUseCase({
  identities,
  identityProvider,
  now,
  requests,
}: ConfirmPasswordResetDependencies): ConfirmPasswordResetUseCase {
  return {
    async execute({ code, password }): Promise<void> {
      const codeHash = hashInvitationCode(code)
      const request = await requests.findByCodeHash({ codeHash })
      const currentTime = now()

      if (
        request !== undefined &&
        shouldRegisterFailedResetAttempt({ attemptedCodeHash: codeHash, now: currentTime, request })
      ) {
        await requests.registerFailedAttempt({ requestId: request.id })
      }

      const decision = assertPasswordResetAccepted(
        decidePasswordReset({ attemptedCodeHash: codeHash, now: currentTime, request }),
      )

      const subject = await resolveIdentitySubject({
        repository: identities,
        userId: decision.userId,
      })

      await identityProvider.setPassword({ password, temporary: false, userId: subject })
      await requests.markConsumed({
        companyId: decision.companyId,
        consumedAt: decision.consumedAt,
        requestId: decision.requestId,
      })
    },
  }
}
