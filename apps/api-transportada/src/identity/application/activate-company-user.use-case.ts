/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CompanyUserNotFoundError } from '../domain/company-user.error.js'
import { toCompanyUserView, type CompanyUserView } from '../domain/company-user.policy.js'
import type { GroupAuditPort } from './company-group.audit.port.js'
import { resolveIdentitySubject } from './company-user-identity.service.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import type { InvitationRepositoryPort } from './invitation.port.js'
import type { IdentityAccessGatewayPort } from '../infrastructure/keycloak-admin.gateway.js'

type ActivateCompanyUserDependencies = {
  readonly audit: GroupAuditPort
  readonly identityGateway: Pick<IdentityAccessGatewayPort, 'setEnabled' | 'setPassword'>
  readonly invitations: Pick<InvitationRepositoryPort, 'findLatestForUser' | 'markAccepted'>
  readonly now: () => Date
  readonly repository: Pick<
    CompanyUserRepositoryPort,
    'findByUserId' | 'findIdentitySubject' | 'setMembershipStatus'
  >
}

export type ActivateCompanyUserInput = {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly correlationId: string
  readonly password?: string
  readonly temporary?: boolean
  readonly userId: string
}

export type ActivateCompanyUserUseCase = {
  execute(input: ActivateCompanyUserInput): Promise<CompanyUserView>
}

/**
 * O convite nasce desabilitado no provedor, e só o código entregue pelo canal habilita. Quando o
 * código não chega, a pessoa fica presa: esta é a saída de quem administra, sem depender do canal.
 *
 * A ordem segue a da troca de status: banco antes de habilitar, e a senha antes de tudo — conta
 * habilitada sem senha é conta aberta sem como entrar. Repetir a chamada converge no mesmo estado.
 */
export function createActivateCompanyUserUseCase({
  audit,
  identityGateway,
  invitations,
  now,
  repository,
}: ActivateCompanyUserDependencies): ActivateCompanyUserUseCase {
  return {
    async execute({ context, correlationId, password, temporary, userId }) {
      const existing = await repository.findByUserId({ companyId: context.companyId, userId })
      if (existing === undefined) throw new CompanyUserNotFoundError()

      const subject = await resolveIdentitySubject({ repository, userId })
      if (password !== undefined) {
        await identityGateway.setPassword({
          password,
          temporary: temporary ?? true,
          userId: subject,
        })
      }
      if (existing.membershipStatus !== 'active') {
        await repository.setMembershipStatus({
          companyId: context.companyId,
          status: 'active',
          userId,
        })
      }
      await identityGateway.setEnabled({ enabled: true, userId: subject })

      const invitation = await invitations.findLatestForUser({
        companyId: context.companyId,
        userId,
      })
      if (invitation?.status === 'pending') {
        await invitations.markAccepted({
          acceptedAt: now(),
          companyId: context.companyId,
          invitationId: invitation.id,
        })
      }

      await audit.record({
        action: 'company-user.activated',
        actorUserId: context.userId,
        companyId: context.companyId,
        correlationId,
        metadata:
          password === undefined
            ? { passwordSet: false }
            : { passwordSet: true, temporary: temporary ?? true },
        targetIds: [userId],
      })

      return toCompanyUserView({
        ...existing,
        membershipStatus: 'active',
        pendingInvitation: undefined,
      })
    },
  }
}
