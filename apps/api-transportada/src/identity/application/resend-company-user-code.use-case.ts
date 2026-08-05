/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CompanyUserNotFoundError } from '../domain/company-user.error.js'
import {
  generateInvitationCode,
  hashInvitationCode,
  planInvitationResend,
} from '../domain/invitation.policy.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import type { InvitationRepositoryPort } from './invitation.port.js'

type ResendCompanyUserCodeDependencies = {
  readonly invitations: Pick<InvitationRepositoryPort, 'create' | 'findLatestForUser'>
  readonly now: () => Date
  readonly repository: Pick<CompanyUserRepositoryPort, 'findByUserId'>
}

export type ResendCompanyUserCodeInput = {
  readonly context: { readonly companyId: string }
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
  invitations,
  now,
  repository,
}: ResendCompanyUserCodeDependencies): ResendCompanyUserCodeUseCase {
  return {
    async execute({ context, userId }) {
      const companyUser = await repository.findByUserId({ companyId: context.companyId, userId })
      if (companyUser === undefined) throw new CompanyUserNotFoundError()

      const previousInvitation = await invitations.findLatestForUser({
        companyId: context.companyId,
        userId,
      })
      const plan = planInvitationResend({ invitation: previousInvitation, now: now() })

      await invitations.create({
        codeHash: hashInvitationCode(generateInvitationCode()),
        companyId: context.companyId,
        expiresAt: plan.expiresAt,
        roles: previousInvitation?.roles ?? [],
        supersededInvitationId: plan.supersededInvitationId,
        userId,
      })

      return { expiresAt: plan.expiresAt.toISOString(), userId }
    },
  }
}
