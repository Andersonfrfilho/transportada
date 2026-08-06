/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  CompanyUserNotFoundError,
  SelfMembershipRemovalError,
} from '../domain/company-user.error.js'
import { shouldDisableIdentity } from '../domain/company-user.policy.js'
import { assertCompanyKeepsAdministrator } from '../domain/invitation.policy.js'
import { resolveIdentitySubject } from './company-user-identity.service.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import type { IdentityEnablementGatewayPort } from './identity-enablement.port.js'

type RemoveCompanyUserMembershipDependencies = {
  readonly identityGateway: IdentityEnablementGatewayPort
  readonly repository: Pick<
    CompanyUserRepositoryPort,
    | 'findByUserId'
    | 'findIdentitySubject'
    | 'listActiveMembershipCompanyIds'
    | 'listAdministratorUserIds'
    | 'removeMembership'
  >
}

export type RemoveCompanyUserMembershipInput = {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly userId: string
}

export type RemoveCompanyUserMembershipUseCase = {
  execute(input: RemoveCompanyUserMembershipInput): Promise<void>
}

/** Desabilita no provedor antes de remover o vínculo: falha no meio deixa sem acesso, não com. */
export function createRemoveCompanyUserMembershipUseCase({
  identityGateway,
  repository,
}: RemoveCompanyUserMembershipDependencies): RemoveCompanyUserMembershipUseCase {
  return {
    async execute({ context, userId }) {
      const existing = await repository.findByUserId({ companyId: context.companyId, userId })
      if (existing === undefined) throw new CompanyUserNotFoundError()

      if (userId === context.userId) throw new SelfMembershipRemovalError()

      const administratorUserIds = await repository.listAdministratorUserIds({
        companyId: context.companyId,
      })
      assertCompanyKeepsAdministrator({ administratorUserIds, nextRoles: [], targetUserId: userId })

      const activeMembershipCompanyIds = await repository.listActiveMembershipCompanyIds({ userId })
      if (
        shouldDisableIdentity({ activeMembershipCompanyIds, leavingCompanyId: context.companyId })
      ) {
        const subject = await resolveIdentitySubject({ repository, userId })
        await identityGateway.setEnabled({ enabled: false, userId: subject })
      }

      await repository.removeMembership({ companyId: context.companyId, userId })
    },
  }
}
