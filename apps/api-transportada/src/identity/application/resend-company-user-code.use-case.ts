/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CompanyUserNotFoundError } from '../domain/company-user.error.js'
import { planInvitationResend } from '../domain/invitation.policy.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import {
  issueInvitationCode,
  type InvitationCodeEnvelopeProviderPort,
} from './invitation-code.service.js'
import type { InvitationDeliveryOutboxPort, InvitationRepositoryPort } from './invitation.port.js'

const INVITATION_DELIVERY_EVENT_TYPE = 'transportada.identity.invitation.code.requested' as const

type ResendCompanyUserCodeDependencies = {
  readonly envelopeProvider: InvitationCodeEnvelopeProviderPort
  readonly invitations: Pick<InvitationRepositoryPort, 'create' | 'findLatestForUser'>
  readonly now: () => Date
  readonly outbox: InvitationDeliveryOutboxPort
  readonly repository: Pick<CompanyUserRepositoryPort, 'findByUserId'>
}

export type ResendCompanyUserCodeInput = {
  readonly context: { readonly companyId: string; readonly userId?: string }
  readonly correlationId?: string
  readonly userId: string
}

export type InvitationDelivery = {
  readonly expiresAt: string
  readonly userId: string
}

export type ResendCompanyUserCodeUseCase = {
  execute(input: ResendCompanyUserCodeInput): Promise<InvitationDelivery>
}

/** Nunca devolve o código nem a mensagem de reenvio — só a nova validade (§ T011 cobre a entrega). */
export function createResendCompanyUserCodeUseCase({
  envelopeProvider,
  invitations,
  now,
  outbox,
  repository,
}: ResendCompanyUserCodeDependencies): ResendCompanyUserCodeUseCase {
  return {
    async execute({ context, correlationId, userId }) {
      const companyUser = await repository.findByUserId({ companyId: context.companyId, userId })
      if (companyUser === undefined) throw new CompanyUserNotFoundError()

      const previousInvitation = await invitations.findLatestForUser({
        companyId: context.companyId,
        userId,
      })
      const plan = planInvitationResend({ invitation: previousInvitation, now: now() })

      const { codeHash, sealedCode } = await issueInvitationCode({
        companyId: context.companyId,
        envelopeProvider,
        userId,
      })
      const invitation = await invitations.create({
        codeHash,
        companyId: context.companyId,
        expiresAt: plan.expiresAt,
        roles: previousInvitation?.roles ?? [],
        sealedCode,
        supersededInvitationId: plan.supersededInvitationId,
        userId,
      })

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

      return { expiresAt: plan.expiresAt.toISOString(), userId }
    },
  }
}
