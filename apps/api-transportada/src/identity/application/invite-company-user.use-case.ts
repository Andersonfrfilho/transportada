/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/identity.schema.js'
import type { ContactChannel } from '../../database/identity-user-profile.schema.js'
import {
  splitPersonName,
  toCompanyUserView,
  type CompanyUserView,
} from '../domain/company-user.policy.js'
import { planInvitationResend } from '../domain/invitation.policy.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import {
  issueInvitationCode,
  type InvitationCodeEnvelopeProviderPort,
} from './invitation-code.service.js'
import type { InvitationDeliveryOutboxPort, InvitationRepositoryPort } from './invitation.port.js'

const INVITATION_DELIVERY_EVENT_TYPE = 'transportada.identity.invitation.code.requested' as const

type InviteIdentityGatewayPort = {
  createUser(input: {
    readonly attributes?: Readonly<Record<string, string | readonly string[]>>
    readonly email: string
    readonly enabled: boolean
    readonly firstName?: string
    readonly lastName?: string
    readonly username: string
  }): Promise<{ readonly subject: string }>
}

type InviteCompanyUserDependencies = {
  readonly envelopeProvider: InvitationCodeEnvelopeProviderPort
  readonly identityGateway: InviteIdentityGatewayPort
  readonly invitations: Pick<InvitationRepositoryPort, 'create'>
  readonly issuer: string
  readonly now: () => Date
  readonly outbox: InvitationDeliveryOutboxPort
  readonly repository: Pick<CompanyUserRepositoryPort, 'createInvitedUser'>
}

export type InviteCompanyUserInput = {
  readonly channel: ContactChannel
  readonly context: { readonly companyId: string; readonly userId?: string }
  readonly contact: string
  readonly correlationId?: string
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
  envelopeProvider,
  identityGateway,
  invitations,
  issuer,
  now,
  outbox,
  repository,
}: InviteCompanyUserDependencies): InviteCompanyUserUseCase {
  return {
    async execute({ channel, context, contact, correlationId, name, roles }) {
      const userId = crypto.randomUUID()
      /** `company_id` é o atributo que o token carrega: sem ele o login entra sem empresa. */
      const { subject } = await identityGateway.createUser({
        attributes: { company_id: context.companyId },
        email: channel === 'email' ? contact : `${userId}@users.invalid`,
        enabled: false,
        ...splitPersonName(name),
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
        username: userId,
      })

      const plan = planInvitationResend({ invitation: undefined, now: now() })
      const { codeHash, sealedCode } = await issueInvitationCode({
        companyId: context.companyId,
        envelopeProvider,
        userId,
      })
      const invitation = await invitations.create({
        codeHash,
        companyId: context.companyId,
        expiresAt: plan.expiresAt,
        roles,
        sealedCode,
        supersededInvitationId: plan.supersededInvitationId,
        userId,
      })

      // Nenhum canal é chamado aqui: a rota persiste e devolve, e a entrega é do worker.
      await outbox.save({
        actorUserId: context.userId ?? userId,
        companyId: context.companyId,
        correlationId: correlationId ?? crypto.randomUUID(),
        eventId: crypto.randomUUID(),
        eventType: INVITATION_DELIVERY_EVENT_TYPE,
        eventVersion: 1,
        invitationId: invitation.id,
        payload: { invitationId: invitation.id, userId },
      })

      return toCompanyUserView({
        contactAddress: contact,
        contactChannel: channel,
        membershipStatus: 'active',
        name,
        pendingInvitation: { expiresAt: plan.expiresAt },
        roles,
        userId,
        username: userId,
      })
    },
  }
}
