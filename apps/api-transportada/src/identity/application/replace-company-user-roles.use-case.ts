/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/identity.schema.js'
import { CompanyUserNotFoundError } from '../domain/company-user.error.js'
import { toCompanyUserView, type CompanyUserView } from '../domain/company-user.policy.js'
import { assertCompanyKeepsAdministrator } from '../domain/invitation.policy.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'

type ReplaceCompanyUserRolesDependencies = {
  readonly repository: Pick<
    CompanyUserRepositoryPort,
    'findByUserId' | 'listAdministratorUserIds' | 'replaceRoles'
  >
}

export type ReplaceCompanyUserRolesInput = {
  readonly context: { readonly companyId: string }
  readonly roles: readonly CompanyRole[]
  readonly userId: string
}

export type ReplaceCompanyUserRolesUseCase = {
  execute(input: ReplaceCompanyUserRolesInput): Promise<CompanyUserView>
}

export function createReplaceCompanyUserRolesUseCase({
  repository,
}: ReplaceCompanyUserRolesDependencies): ReplaceCompanyUserRolesUseCase {
  return {
    async execute({ context, roles, userId }) {
      const existing = await repository.findByUserId({ companyId: context.companyId, userId })
      if (existing === undefined) throw new CompanyUserNotFoundError()

      const administratorUserIds = await repository.listAdministratorUserIds({
        companyId: context.companyId,
      })
      assertCompanyKeepsAdministrator({
        administratorUserIds,
        nextRoles: roles,
        targetUserId: userId,
      })

      await repository.replaceRoles({ companyId: context.companyId, roles, userId })

      return toCompanyUserView({ ...existing, roles })
    },
  }
}
