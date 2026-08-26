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
  readonly email?: string
  readonly name: string
  readonly phone?: string
  readonly roles: readonly CompanyRole[]
  readonly taxId?: string
}

export type InviteCompanyUserResult = CompanyUserView & {
  /**
   * Papel de frota marcado e nenhuma ficha com esse CPF: a pessoa entra no sistema e não aparece
   * na frota. Não é erro — pode-se convidar antes de cadastrar a ficha —, mas a tela precisa
   * dizer, senão o operador só descobre quando for montar uma viagem.
   */
  readonly fleetLink: 'linked' | 'not-applicable' | 'no-driver-record'
}

export type InviteCompanyUserUseCase = {
  execute(input: InviteCompanyUserInput): Promise<InviteCompanyUserResult>
}

const FLEET_LINKED_ROLES: readonly CompanyRole[] = ['driver', 'aggregate']

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
    async execute({ channel, context, contact, correlationId, email, name, phone, roles, taxId }) {
      const userId = crypto.randomUUID()
      /** O contato é o canal do convite, não a identidade: quem escolheu SMS também tem e-mail. */
      const profileEmail = email ?? (channel === 'email' ? contact : '')
      const profilePhone = phone ?? (channel === 'email' ? '' : contact)
      const profileTaxId = taxId ?? ''
      /** `company_id` é o atributo que o token carrega: sem ele o login entra sem empresa. */
      const { subject } = await identityGateway.createUser({
        attributes: { company_id: context.companyId },
        email: channel === 'email' ? contact : `${userId}@users.invalid`,
        enabled: false,
        ...splitPersonName(name),
        username: userId,
      })

      const { linkedFleetDriverId, membershipId } = await repository.createInvitedUser({
        companyId: context.companyId,
        contactAddress: contact,
        contactChannel: channel,
        email: profileEmail,
        issuer,
        name,
        phone: profilePhone,
        roles,
        taxId: profileTaxId,
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

      return {
        ...toCompanyUserView({
          contactAddress: contact,
          contactChannel: channel,
          email: profileEmail,
          membershipId,
          membershipStatus: 'active',
          name,
          pendingInvitation: { expiresAt: plan.expiresAt },
          phone: profilePhone,
          roles,
          taxId: profileTaxId,
          userId,
          username: userId,
        }),
        fleetLink: resolveFleetLink({ linkedFleetDriverId, roles }),
      }
    },
  }
}

function resolveFleetLink({
  linkedFleetDriverId,
  roles,
}: {
  readonly linkedFleetDriverId: string | null
  readonly roles: readonly CompanyRole[]
}): InviteCompanyUserResult['fleetLink'] {
  if (!roles.some((role) => FLEET_LINKED_ROLES.includes(role))) return 'not-applicable'
  return linkedFleetDriverId === null ? 'no-driver-record' : 'linked'
}
