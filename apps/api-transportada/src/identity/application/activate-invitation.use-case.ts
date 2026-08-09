/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  assertInvitationAccepted,
  decideInvitationActivation,
  hashInvitationCode,
  shouldRegisterFailedAttempt,
  type InvitationSnapshot,
} from '../domain/invitation.policy.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import { resolveIdentitySubject } from './company-user-identity.service.js'

type ActivateInvitationIdentityProviderPort = {
  setEnabled(input: { readonly enabled: boolean; readonly userId: string }): Promise<void>
  setPassword(input: {
    readonly password: string
    readonly temporary: boolean
    readonly userId: string
  }): Promise<void>
}

type ActivateInvitationRepositoryPort = {
  findByCodeHash(input: { readonly codeHash: string }): Promise<InvitationSnapshot | undefined>
  markAccepted(input: {
    readonly acceptedAt: Date
    readonly companyId: string
    readonly invitationId: string
  }): Promise<void>
  registerFailedAttempt(input: { readonly invitationId: string }): Promise<void>
}

type ActivateInvitationDependencies = {
  /** O Admin API só conhece o `subject` do provedor; o `identity_users.id` não existe lá. */
  readonly identities: Pick<CompanyUserRepositoryPort, 'findIdentitySubject'>
  readonly identityProvider: ActivateInvitationIdentityProviderPort
  readonly invitations: ActivateInvitationRepositoryPort
  readonly now: () => Date
}

type ActivateInvitationInput = {
  readonly code: string
  readonly password: string
}

export type ActivateInvitationUseCase = {
  execute(input: ActivateInvitationInput): Promise<void>
}

export function createActivateInvitationUseCase({
  identities,
  identityProvider,
  invitations,
  now,
}: ActivateInvitationDependencies): ActivateInvitationUseCase {
  return {
    async execute({ code, password }: ActivateInvitationInput): Promise<void> {
      const codeHash = hashInvitationCode(code)
      const invitation = await invitations.findByCodeHash({ codeHash })
      const currentTime = now()

      if (
        invitation !== undefined &&
        shouldRegisterFailedAttempt({ attemptedCodeHash: codeHash, invitation, now: currentTime })
      ) {
        await invitations.registerFailedAttempt({ invitationId: invitation.id })
      }

      const decision = assertInvitationAccepted(
        decideInvitationActivation({ attemptedCodeHash: codeHash, invitation, now: currentTime }),
      )

      const subject = await resolveIdentitySubject({
        repository: identities,
        userId: decision.userId,
      })

      await identityProvider.setPassword({ password, temporary: false, userId: subject })
      await identityProvider.setEnabled({ enabled: true, userId: subject })
      await invitations.markAccepted({
        acceptedAt: decision.acceptedAt,
        companyId: decision.companyId,
        invitationId: decision.invitationId,
      })
    },
  }
}
