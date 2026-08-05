/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/identity.schema.js'
import type { ContactChannel } from '../../database/identity-user-profile.schema.js'
import { toCompanyUserView, type CompanyUserView } from '../domain/company-user.policy.js'
import {
  generateInvitationCode,
  hashInvitationCode,
  planInvitationResend,
} from '../domain/invitation.policy.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import type { InvitationRepositoryPort } from './invitation.port.js'

type InviteIdentityGatewayPort = {
  createUser(input: {
    readonly email: string
    readonly enabled: boolean
    readonly username: string
  }): Promise<{ readonly subject: string }>
}

type InviteCompanyUserDependencies = {
  readonly identityGateway: InviteIdentityGatewayPort
  readonly invitations: Pick<InvitationRepositoryPort, 'create'>
  readonly issuer: string
  readonly now: () => Date
  readonly repository: Pick<CompanyUserRepositoryPort, 'createInvitedUser'>
}

export type InviteCompanyUserInput = {
  readonly channel: ContactChannel
  readonly context: { readonly companyId: string }
  readonly contact: string
  readonly name: string
  readonly roles: readonly CompanyRole[]
}

export type InviteCompanyUserUseCase = {
  execute(input: InviteCompanyUserInput): Promise<CompanyUserView>
}

/**
 * Usuário nasce desabilitado e sem senha no Keycloak: só a ativação (código → senha) habilita.
 * `username` sintetiza o id interno porque o contato pode ser telefone, sem formato de login.
 */
export function createInviteCompanyUserUseCase({
  identityGateway,
  invitations,
  issuer,
  now,
  repository,
}: InviteCompanyUserDependencies): InviteCompanyUserUseCase {
  return {
    async execute({ channel, context, contact, name, roles }) {
      const userId = crypto.randomUUID()
      const { subject } = await identityGateway.createUser({
        email: channel === 'email' ? contact : `${userId}@users.invalid`,
        enabled: false,
        username: userId,
      })

      await repository.createInvitedUser({
        companyId: context.companyId,
        contactAddress: contact,
        contactChannel: channel,
        issuer,
        name,
        subject,
        userId,
      })

      const plan = planInvitationResend({ invitation: undefined, now: now() })
      await invitations.create({
        codeHash: hashInvitationCode(generateInvitationCode()),
        companyId: context.companyId,
        expiresAt: plan.expiresAt,
        roles,
        supersededInvitationId: plan.supersededInvitationId,
        userId,
      })

      return toCompanyUserView({
        contactAddress: contact,
        contactChannel: channel,
        membershipStatus: 'active',
        name,
        pendingInvitation: { expiresAt: plan.expiresAt },
        roles,
        userId,
      })
    },
  }
}
