/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  CompanyUserNotFoundError,
  SelfMembershipRemovalError,
} from '../domain/company-user.error.js'
import { assertCompanyKeepsAdministrator } from '../domain/invitation.policy.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'

type RemoveCompanyUserMembershipDependencies = {
  readonly repository: Pick<
    CompanyUserRepositoryPort,
    'findByUserId' | 'listAdministratorUserIds' | 'removeMembership'
  >
}

export type RemoveCompanyUserMembershipInput = {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly userId: string
}

export type RemoveCompanyUserMembershipUseCase = {
  execute(input: RemoveCompanyUserMembershipInput): Promise<void>
}

export function createRemoveCompanyUserMembershipUseCase({
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

      await repository.removeMembership({ companyId: context.companyId, userId })
    },
  }
}
